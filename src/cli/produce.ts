/**
 * Produce one episode: news → selection → research → script → content loop → (unless dry run) voices → MP3.
 * Everything lands in out/. Publishing is done afterwards by the workflow (release + register + site).
 *
 * Env: SC_DRY_RUN=true, SC_WEEKDAY=auto|monday..friday, SC_MINUTES, SC_NOTES, SC_OUT (default "out"),
 *      SC_SKIP_IF_PUBLISHED=true (scheduled runs: do nothing if today's episode exists).
 */
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleEpisode, durationSeconds } from '../audio';
import { type Config, isCoreTopic, loadConfig, type SegmentId } from '../config';
import { collectNews, type FeedItem, normalizeUrl } from '../feeds';
import { type EpisodeRecord, lastPublished, readHistory, recentEpisodes, type StoryRecord } from '../history';
import type { Source } from '../llm';
import { fetchQuotes, type Quote, quotesTable } from '../markets';
import { chunkForTts, type Draft, transcript } from '../script';
import { type Research, researchQuestion, researchStory } from '../stages/research';
import { blocking, contentLoop, formatIssues, type ReviewRound } from '../stages/review';
import { type Selection, selectStories } from '../stages/select';
import { type Brief, writeDraft } from '../stages/write';
import { localDate, showWeekday, spokenDate, windowStart } from '../time';
import { speakAll } from '../tts';

const env = process.env;
const dryRun = env.SC_DRY_RUN === 'true';
const outDir = env.SC_OUT ?? 'out';
const MIN_ITEMS = 8;

function setOutput(values: Record<string, string>): void {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}

function itemBlock(item: FeedItem): string {
  return `[${item.id}] ${item.title}\n(${item.feed}, ${item.published.toISOString().slice(0, 16)}Z, topic ${item.topic}) ${item.url}\n${item.snippet}`;
}

function researchBlock(r: Research): string {
  return [
    r.articleText ? `Article excerpt:\n${r.articleText.slice(0, 2500)}` : '',
    `Research notes:\n${r.notes}`,
    r.sources.length ? `Sources: ${r.sources.map((s) => s.url).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function episodeDigest(episodes: EpisodeRecord[]): string {
  return episodes
    .map((e) => `Episode ${e.number} (${e.weekday} ${e.date}): ${e.title}\n${e.stories.map((s) => `  - ${s.title}: ${s.summary}`).join('\n')}${e.openThreads.length ? `\n  Open threads: ${e.openThreads.join('; ')}` : ''}`)
    .join('\n');
}

async function segmentMaterial(
  config: Config,
  segment: SegmentId,
  now: Date,
  history: EpisodeRecord[],
  items: Map<string, FeedItem>,
  selection: Selection,
  quotes: Quote[],
  quoteFailures: string[],
  research: Research[],
): Promise<string> {
  const picked = selection.segment_items.flatMap((id) => (items.has(id) ? [items.get(id)!] : []));
  const lastWeek = recentEpisodes(history, now, 8);
  switch (segment) {
    case 'look_back': {
      const threads = lastWeek.flatMap((e) => e.openThreads.map((t) => `${t} (from episode ${e.number}, ${e.date})`));
      let update = '';
      if (threads.length) {
        const r = await researchQuestion(config, 'research:threads', `For each of these stories, what has happened since the date given? Be specific and dated; say "no new developments" where that's the case.\n${threads.join('\n')}`);
        research.push(r);
        update = `\nStill developing, research:\n${r.notes}`;
      }
      return `Last week's episodes:\n${episodeDigest(lastWeek) || '(no episodes last week; skip the week in review and say this is the first look-back)'}${update}\n\nWeekend stories for the roundup:\n${picked.map(itemBlock).join('\n\n') || '(use the headline and main stories)'}`;
    }
    case 'deep_dive':
      return 'The deep dive goes further into main story 1, using its research notes: history, precedents, numbers, the strongest arguments on each side and what to watch next. Keep main_1 itself short and hand over to the deep dive.';
    case 'far_field': {
      const item = picked[0] ?? [...items.values()].find((i) => !isCoreTopic(config, i.topic));
      if (!item) return 'No outside-topic story was available today. Say so in one line and use the time for quick hits.';
      const r = await researchStory(config, item, 'Explain it for someone who never reads about this field.', false);
      research.push(r);
      return `${itemBlock(item)}\n\n${researchBlock(r)}`;
    }
    case 'markets':
      return `Market table (the ONLY source for market numbers; closes are the latest session, "5 sessions" is the change over the last five trading days):
${quotes.length ? quotesTable(quotes) : '(no market data available today)'}
${quoteFailures.length ? `Unavailable today, don't mention numbers for these: ${quoteFailures.join('; ')}` : ''}

Market news for context:
${picked.map(itemBlock).join('\n\n') || '(none picked)'}`;
    case 'prediction_check': {
      const predictions = lastWeek.flatMap((e) => e.predictions.map((p) => `"${p.text}" (${p.by}, episode ${e.number}, ${e.date})`));
      let grading = 'No predictions were made this week. Say so in one line and spend the time on weekend picks.';
      if (predictions.length) {
        const r = await researchQuestion(config, 'research:predictions', `Today is ${localDate(now, config.show.timezone)}. For each prediction, find out whether it has come true, turned out wrong, or it's too early to say. Give the evidence with dates.\n${predictions.join('\n')}`);
        research.push(r);
        grading = `Predictions to grade:\n${predictions.join('\n')}\n\nResearch:\n${r.notes}`;
      }
      return `${grading}\n\nWeekend pick candidates:\n${picked.map(itemBlock).join('\n\n') || '(choose from this week\'s stories)'}\n\nThis week's stories:\n${episodeDigest(lastWeek)}`;
    }
  }
}

function showNotes(config: Config, draft: Draft, stories: StoryRecord[], sources: Source[]): string {
  const seen = new Set(stories.map((s) => normalizeUrl(s.url)));
  const extra = sources.filter((s) => {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [
    draft.description,
    '## Stories',
    stories.map((s) => `- [${s.title}](${s.url})`).join('\n'),
    extra.length ? `## Further sources\n${extra.map((s) => `- [${s.title}](${s.url})`).join('\n')}` : '',
    `---\n${config.show.title} is produced with AI. ${config.hosts.map((h) => h.name).join(' and ')} are AI-generated hosts; stories come from the linked sources.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function reviewReport(rounds: ReviewRound[], selection: Selection, warnings: string[]): string {
  return [
    '# Review',
    `Selection notes: ${selection.notes}`,
    warnings.length ? `Selection warnings:\n${warnings.map((w) => `- ${w}`).join('\n')}` : '',
    ...rounds.map((r) => `## Round ${r.round} (${r.words} words)\n${r.issues.length ? formatIssues(r.issues) : 'No issues.'}`),
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const now = new Date();
  const tz = config.show.timezone;
  const weekday = showWeekday(now, tz, env.SC_WEEKDAY);
  const format = config.schedule.weekdays[weekday];
  const minutes = env.SC_MINUTES ? Number(env.SC_MINUTES) : format.minutes;
  const date = localDate(now, tz);
  const spoken = spokenDate(now, tz);
  const history = readHistory();
  if (env.SC_SKIP_IF_PUBLISHED === 'true' && history.some((e) => e.date === date)) {
    console.log(`[produce] episode for ${date} already published; nothing to do`);
    setOutput({ published: 'false', skipped: 'true' });
    return;
  }
  mkdirSync(outDir, { recursive: true });
  console.log(`[produce] ${date}, ${weekday} format (${format.segment}), ${minutes} min${dryRun ? ', dry run' : ''}`);

  const from = windowStart(now, lastPublished(history), config.schedule.window_cap_days, config.schedule.first_run_hours);
  const covered = new Set(history.flatMap((e) => e.stories.map((s) => normalizeUrl(s.url))));
  const { items, results } = await collectNews(config, from, now, covered);
  const failed = results.filter((r) => !r.ok);
  console.log(`[feeds] ${items.length} items since ${from.toISOString()}; ${failed.length} feeds failed${failed.length ? `: ${failed.map((f) => f.name).join(', ')}` : ''}`);
  if (items.length < MIN_ITEMS) throw new Error(`Only ${items.length} news items in the window; not enough for an episode.`);
  const byId = new Map(items.map((i) => [i.id, i]));

  const { quotes, failures: quoteFailures } = await fetchQuotes(config);
  if (quoteFailures.length) console.warn(`[markets] unavailable: ${quoteFailures.join('; ')}`);

  const notes = env.SC_NOTES?.trim() ?? '';
  const { selection, warnings } = await selectStories(config, format.segment, items, history, notes);
  console.log(`[select] main: ${selection.main.map((m) => byId.get(m.id)?.title).join(' | ')}`);

  const research: Research[] = [];
  const mainBlocks: string[] = [];
  for (const [n, main] of selection.main.entries()) {
    const item = byId.get(main.id)!;
    const r = await researchStory(config, item, main.angle, n === 0 && format.segment === 'deep_dive');
    research.push(r);
    mainBlocks.push(`== MAIN STORY ${n + 1} ==\nAngle: ${main.angle}${main.follow_up_of ? `\nFollow-up of: ${main.follow_up_of}` : ''}\n${itemBlock(item)}\n\n${researchBlock(r)}`);
  }
  const segment = config.segments[format.segment];
  const segmentText = await segmentMaterial(config, format.segment, now, history, byId, selection, quotes, quoteFailures, research);
  const list = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [itemBlock(byId.get(id)!)] : [])).join('\n\n');

  const materials = [
    `== HEADLINES ==\n${list(selection.headlines)}`,
    ...mainBlocks,
    `== SEGMENT: ${segment.title} ==\n${segmentText}`,
    `== QUICK HITS ==\n${list(selection.quick_hits)}`,
    format.segment !== 'markets' && quotes.length ? `== MARKET TABLE (only source for market numbers) ==\n${quotesTable(quotes)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const brief: Brief = {
    weekday: spoken.weekday,
    date: spoken.date,
    segment: format.segment,
    targetWords: Math.round(minutes * config.episode.words_per_minute),
    materials,
    producerNotes: notes,
  };
  writeFileSync(join(outDir, 'materials.md'), materials);

  const first = await writeDraft(config, brief);
  const { draft, sections, rounds, unresolved } = await contentLoop(config, brief, first, spoken, quotes);

  const pickedIds = [...new Set([...selection.main.map((m) => m.id), ...selection.headlines, ...selection.segment_items, ...selection.quick_hits])];
  const summaries = new Map(draft.story_summaries.map((s) => [s.id, s.summary]));
  const stories: StoryRecord[] = pickedIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [{ title: item.title, url: item.url, topic: item.topic, summary: summaries.get(id) ?? item.snippet.slice(0, 200) }] : [];
  });

  writeFileSync(join(outDir, 'script.json'), JSON.stringify({ ...draft, sections }, null, 2));
  writeFileSync(join(outDir, 'transcript.md'), `# ${draft.title}\n\n${transcript(sections)}\n`);
  writeFileSync(join(outDir, 'notes.md'), showNotes(config, draft, stories, research.flatMap((r) => r.sources)));
  writeFileSync(join(outDir, 'review.md'), reviewReport(rounds, selection, warnings));

  const critical = blocking(unresolved);
  if (critical.length) {
    console.warn(`[review] ${critical.length} critical issues remain:\n${formatIssues(critical)}`);
    if (!dryRun && config.quality.on_unresolved === 'stop') {
      throw new Error('Critical issues remain after the content loop (quality.on_unresolved = stop). See out/review.md.');
    }
  }
  if (dryRun) {
    console.log(`[produce] dry run done: "${draft.title}". Read ${outDir}/review.md and ${outDir}/transcript.md.`);
    setOutput({ published: 'false' });
    return;
  }

  const chunks = chunkForTts(sections, config.tts.max_chars_per_request);
  const parts = await speakAll(config, chunks);
  const file = `signal-check-${date}.mp3`;
  const mp3 = join(outDir, file);
  assembleEpisode(config, parts, outDir, mp3, { title: draft.title, artist: config.show.author });
  const duration = durationSeconds(mp3);
  const target = minutes * 60;
  if (Math.abs(duration - target) / target > config.audio.length_warning_tolerance) {
    console.warn(`::warning::Episode is ${Math.round(duration / 60)} min; target is ${minutes} min.`);
  }

  const tag = `ep-${date}`;
  const meta = {
    date,
    publishedAt: now.toISOString(),
    weekday,
    segment: format.segment,
    title: draft.title,
    description: draft.description,
    file,
    tag,
    bytes: statSync(mp3).size,
    durationSeconds: duration,
    stories,
    predictions: draft.predictions,
    openThreads: draft.open_threads,
  };
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  setOutput({ published: 'true', tag, file, title: draft.title.replaceAll('\n', ' ') });
  console.log(`[produce] ${file}: ${Math.round(duration / 60)} min, ${chunks.length} TTS requests`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
