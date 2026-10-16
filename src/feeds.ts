import { readFileSync } from 'node:fs';
import Parser from 'rss-parser';
import type { Config } from './config';

export interface FeedItem {
  id: string;
  feed: string;
  topic: string;
  title: string;
  url: string;
  published: Date;
  snippet: string;
}

export interface FeedResult {
  name: string;
  url: string;
  ok: boolean;
  items: number;
  newest?: Date;
  error?: string;
}

const USER_AGENT = 'SignalCheckPodcast/1.0 (+https://github.com)';
const parser = new Parser();

export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  // Rehearsals run without internet: feeds come from the fixture and article pages aren't fetched.
  if (process.env.SC_FIXTURE_FEEDS) throw new Error(`no network in fixture mode (${url})`);
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

type RawItem = Omit<FeedItem, 'id'>;

async function readFeed(feed: Config['feeds'][number]): Promise<RawItem[]> {
  const parsed = await parser.parseString(await fetchText(feed.url));
  return parsed.items.flatMap((item) => {
    const date = item.isoDate ?? item.pubDate;
    const url = item.link?.trim();
    if (!date || !url || !item.title) return [];
    const published = new Date(date);
    if (Number.isNaN(published.getTime())) return [];
    const snippet = (item.contentSnippet ?? item.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    return [{ feed: feed.name, topic: feed.topic, title: item.title.trim(), url, published, snippet }];
  });
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'cmpid') u.searchParams.delete(key);
    }
    return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch {
    return url;
  }
}

/** Keep items inside the window, drop duplicates and already-covered URLs, newest first, with short ids. */
export function prepareItems(items: RawItem[], from: Date, to: Date, coveredUrls: Set<string>): FeedItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return items
    .filter((i) => i.published >= from && i.published <= to)
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .filter((i) => {
      const url = normalizeUrl(i.url);
      const title = i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (coveredUrls.has(url) || seenUrls.has(url) || seenTitles.has(title)) return false;
      seenUrls.add(url);
      seenTitles.add(title);
      return true;
    })
    .map((i, n) => ({ ...i, id: `s${n + 1}` }));
}

/** A fixture item: like a feed item, with either an ISO `published` or `hoursAgo` (relative to `now`). */
export interface FixtureItem {
  feed: string;
  topic: string;
  title: string;
  url: string;
  snippet?: string;
  published?: string;
  hoursAgo?: number;
}

export function fixtureItems(fixture: FixtureItem[], now: Date): { raw: RawItem[]; results: FeedResult[] } {
  const raw = fixture.map((f) => ({
    feed: f.feed,
    topic: f.topic,
    title: f.title,
    url: f.url,
    snippet: f.snippet ?? '',
    published: f.published ? new Date(f.published) : new Date(now.getTime() - (f.hoursAgo ?? 1) * 3_600_000),
  }));
  const names = [...new Set(raw.map((r) => r.feed))];
  const results = names.map((name) => ({ name, url: 'fixture', ok: true, items: raw.filter((r) => r.feed === name).length }));
  return { raw, results };
}

export async function collectNews(
  config: Config,
  from: Date,
  to: Date,
  coveredUrls: Set<string>,
): Promise<{ items: FeedItem[]; results: FeedResult[] }> {
  const fixture = process.env.SC_FIXTURE_FEEDS;
  if (fixture) {
    const { raw, results } = fixtureItems(JSON.parse(readFileSync(fixture, 'utf8')) as FixtureItem[], to);
    console.log(`[feeds] fixture mode: ${raw.length} items from ${fixture}`);
    return { items: prepareItems(raw, from, to, coveredUrls), results };
  }
  const settled = await Promise.allSettled(config.feeds.map(readFeed));
  const results: FeedResult[] = [];
  const raw: RawItem[] = [];
  settled.forEach((s, n) => {
    const feed = config.feeds[n]!;
    if (s.status === 'fulfilled') {
      raw.push(...s.value);
      const newest = s.value.reduce<Date | undefined>((m, i) => (!m || i.published > m ? i.published : m), undefined);
      results.push({ name: feed.name, url: feed.url, ok: true, items: s.value.length, newest });
    } else {
      results.push({ name: feed.name, url: feed.url, ok: false, items: 0, error: String(s.reason?.message ?? s.reason) });
    }
  });
  return { items: prepareItems(raw, from, to, coveredUrls), results };
}
