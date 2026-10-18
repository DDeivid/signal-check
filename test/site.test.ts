import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardTheme } from '../src/color';
import { loadConfig } from '../src/config';
import type { EpisodeRecord } from '../src/history';
import { cardStyle, easedFade, fallbackArt, indexBody } from '../src/site';

const config = loadConfig();

const episode = (n: number, date: string, extra: Partial<EpisodeRecord> = {}): EpisodeRecord => ({
  number: n, date, publishedAt: `${date}T05:20:00Z`, weekday: 'friday', segment: 'prediction_check',
  title: `Episode <${n}>`, description: 'D', audioUrl: 'https://x/a.mp3', audioBytes: 1, durationSeconds: 577,
  stories: Array.from({ length: 9 }, (_, i) => ({ title: `Story ${i + 1}`, url: `https://news.example/${i}`, topic: 'world', summary: 'S' })),
  predictions: [], openThreads: [], transcriptFile: '', notesFile: '', ...extra,
});

describe('site', () => {
  it('opens the newest episode in full and keeps older ones compact, grouped by week', () => {
    const html = indexBody(config, [episode(1, '2026-10-09'), episode(2, '2026-10-15'), episode(3, '2026-10-16')]);
    const cards = html.match(/<article class="card [^"]+"/g);
    expect(cards).toEqual(['<article class="card big lead"', '<article class="card mini"', '<article class="card mini"']);
    expect(html.match(/<h3 class="week">[^<]+/g)).toEqual(['<h3 class="week">Week of 12 October', '<h3 class="week">Week of 5 October']);
    expect(html).toContain('Episode &lt;3&gt;');
  });

  it('lists the first stories as a timeline, without topic labels, and points to the rest', () => {
    const html = indexBody(config, [episode(1, '2026-10-16')]);
    expect(html.match(/<li><a href="https:\/\/news.example/g)).toHaveLength(6);
    expect(html).toContain('3 more stories in the notes');
    expect(html).not.toContain('world');
  });

  it('lists stories by their short label, with the full headline as a tooltip', () => {
    const e = episode(1, '2026-10-16');
    e.stories[0] = { ...e.stories[0]!, title: 'A very long <headline> from the feed', label: 'Short label' };
    const html = indexBody(config, [e]);
    expect(html).toContain('title="A very long &lt;headline&gt; from the feed">Short label</a>');
    expect(html).toContain('>Story 2</a>'); // no label: the headline itself
  });

  it('gives every card a player: play, elapsed and total time, a seek bar and speed', () => {
    const html = indexBody(config, [episode(1, '2026-10-16')]);
    const player = html.match(/<div class="player">.*?<\/div>/)![0];
    expect(player).toContain('class="pp" data-play');
    expect(player).toContain('<span class="now">0:00</span>');
    expect(player).toContain('<input class="seek" type="range" min="0" max="577"');
    expect(player).toContain('<span class="total">9:37</span>');
    expect(player).toContain('class="speed"');
  });

  it('fades the image in smoothly from fully hidden to fully shown', () => {
    const alphas = [...easedFade('to right', 0, 64).matchAll(/rgba\(0,0,0,([\d.]+)\) ([\d.]+)%/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(alphas[0]).toEqual([0, 0]);
    expect(alphas.at(-1)).toEqual([1, 64]);
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]![0]!).toBeGreaterThanOrEqual(alphas[i - 1]![0]!);
    expect(alphas.length).toBeGreaterThan(10);
  });

  it('uses the episode image and its colour, or drawn ridgelines in the fallback colour', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-site-'));
    mkdirSync(join(dir, 'art'));
    const file = join(dir, 'art', '2026-10-16.webp');
    writeFileSync(file, 'x');
    const withArt = indexBody(config, [episode(1, '2026-10-16', { art: { file, color: '#2E86C1', model: 'm' } })]);
    expect(withArt).toContain('<img class="art" src="./art/2026-10-16.webp"');
    expect(withArt).toContain('<span class="ai-tag">AI image</span>');
    expect(withArt).toContain(cardStyle('#2E86C1'));
    const missing = indexBody(config, [episode(1, '2026-10-16', { art: { file: join(dir, 'gone.webp'), color: '#2E86C1', model: 'm' } })]);
    expect(missing).toContain('<svg class="art"');
    expect(missing).not.toContain('ai-tag');
    expect(missing).toContain(`--acc-l:${cardTheme(config.art.fallback_color).accentLight}`);
  });

  it('draws the same fallback picture for the same date', () => {
    expect(fallbackArt('2026-10-16', '#3F8F75')).toBe(fallbackArt('2026-10-16', '#3F8F75'));
    expect(fallbackArt('2026-10-16', '#3F8F75')).not.toBe(fallbackArt('2026-10-15', '#3F8F75'));
  });

  it('says the hosts are AI and handles an empty history', () => {
    expect(indexBody(config, [])).toContain('AI-hosted by Mia and Theo');
    expect(indexBody(config, [])).toContain('The first episode is on its way.');
  });
});
