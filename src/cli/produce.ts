/**
 * Produce one episode: news → selection → research → script → content loop → (unless dry run) voices → MP3.
 * Everything lands in out/. Publishing is done afterwards by the workflow (release + register + site).
 *
 * Env: SC_DRY_RUN=true, SC_WEEKDAY=auto|monday..friday, SC_MINUTES, SC_NOTES, SC_OUT (default "out"),
 *      SC_SKIP_IF_PUBLISHED=true (scheduled runs: do nothing if today's episode exists).
 *      SC_RESUME_SCRIPT=<script.json from an earlier run>: voice-only rerun. Skips feeds, selection, research,
 *        writing and review; voices that script, uses the notes.md next to it, writes meta.json as usual.
 *        Refuses a script dated other than today unless SC_RESUME_ALLOW_OTHER_DATE=true.
 *      Rehearsals: SC_FAKE_AI=true, SC_FIXTURE_FEEDS=<items.json>, SC_FIXTURE_MARKETS=<quotes.json>.
 *
 * Debugging output in out/: summary.md (always), error.txt (on failure), selection.json, research.json, tts.json.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleEpisode, audioFileName, probeSeconds } from '../audio';
import { reconcile, wavSeconds } from '../audio-qa';
import { type Config, isCoreTopic, loadConfig, type SegmentId } from '../config';
import { collectNews, type FeedItem, normalizeUrl } from '../feeds';
import { type EpisodeRecord, lastPublished, type PredictionGrade, readHistory, recentEpisodes, type StoryRecord } from '../history';
import { failureHint, modelUses, type Source } from '../llm';
import { fetchQuotes, type Quote, quotesTable } from '../markets';
import { episodeBadges, textBadges } from '../models';
import { loadResume, type SavedScript } from '../resume';
import { emptyRun, summaryMarkdown } from '../run-summary';
import { chunkForTts, transcript } from '../script';
import { describePending, evidenceItems, gradePredictions, gradesBlock, newsResearchBlock, predictionsToGrade } from '../stages/followups';
import { type Research, researchFromNews, researchStory } from '../stages/research';
import { blocking, contentLoop, formatIssues, type ReviewRound } from '../stages/review';
import { type Selection, selectStories } from '../stages/select';
import { type Brief, writeDraft } from '../stages/write';
import { localDate, showWeekday, spokenDate, windowStart } from '../time';
import { type ChunkReport, speakAll } from '../tts';

const env = process.env;
const dryRun = env.SC_DRY_RUN === 'true';
const outDir = env.SC_OUT ?? 'out';
const MIN_ITEMS = 8;

/** Where the run is, for error.txt and the summary. */
let stage = 'setup';
const run = emptyRun();

function writeSummary(): void {
  writeFileSync(join(outDir, 'summary.md'), summaryMarkdown(run, modelUses()));
}

const writeJson = (file: string, value: unknown) => writeFileSync(join(outDir, file), `${JSON.stringify(value, null, 2)}\n`);

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
): Promise<{ text: string; predictionGrades?: PredictionGrade[] }> {
  const picked = selection.segment_items.flatMap((id) => (items.has(id) ? [items.get(id)!] : []));
  const lastWeek = recentEpisodes(history, now, 8);
  // Follow-up research gets the news window as evidence: without web search it is the only evidence.
  const evidence = evidenceItems([...items.values()]);
  switch (segment) {
    case 'look_back': {
      const threads = lastWeek.flatMap((e) => e.openThreads.map((t) => `${t} (from episode ${e.number}, ${e.date})`));
      let update = '';
      if (threads.length) {
        const question = `For each of these stories from last week's episodes, what do today's news items say has happened since the date given? One short paragraph per story.\n${threads.join('\n')}`;
        const r = await researchFromNews(config, 'research:threads', question, evidence);
        research.push(r);
        update = `\n\n${newsResearchBlock('Still developing, research', r, items, itemBlock)}`;
      }
      return { text: `Last week's episodes:\n${episodeDigest(lastWeek) || '(no episodes last week; skip the week in review and say this is the first look-back)'}${update}\n\nWeekend stories for the roundup:\n${picked.map(itemBlock).join('\n\n') || '(use the headline and main stories)'}` };
    }
    case 'deep_dive':
      return { text: 'The deep dive goes further into main story 1, using its research notes: history, precedents, numbers, the strongest arguments on each side and what to watch next. Keep main_1 itself short and hand over to the deep dive.' };
    case 'far_field': {
      const item = picked[0] ?? [...items.values()].find((i) => !isCoreTopic(config, i.topic));
      if (!item) return { text: 'No outside-topic story was available today. Say so in one line and use the time for quick hits.' };
      const r = await researchStory(config, item, 'Explain it for someone who never reads about this field.', false);
      research.push(r);
      return { text: `${itemBlock(item)}\n\n${researchBlock(r)}` };
    }
    case 'markets':
      return { text: `Market table (the ONLY source for market numbers; "latest close" is the last finished session, "day" is its change vs the session before, "5 sessions" is the change over the last five finished sessions):
${quotes.length ? quotesTable(quotes) : '(no market data available today)'}
${quoteFailures.length ? `Unavailable today, don't mention numbers for these: ${quoteFailures.join('; ')}` : ''}

Market news for context:
${picked.map(itemBlock).join('\n\n') || '(none picked)'}` };
    case 'prediction_check': {
      // Each prediction is graded once: those since the previous check, plus its too_early ones (carried at most twice).
      const pending = predictionsToGrade(history);
      let grading = 'No predictions are waiting to be graded. Say so in one line and spend the time on weekend picks.';
      let predictionGrades: PredictionGrade[] | undefined;
      if (pending.length) {
        const today = localDate(now, config.show.timezone);
        const question = `Today is ${today}. For each prediction, what do today's news items say: has it come true, turned out wrong, or is it too early to say?\n${pending.map(describePending).join('\n')}`;
        const r = await researchFromNews(config, 'research:predictions', question, evidence);
        research.push(r);
        predictionGrades = await gradePredictions(config, today, pending, r, evidence);
        grading = `Predictions to grade. The verdicts are decided; give them as stated, with their evidence:\n${gradesBlock(predictionGrades, pending)}\n\n${newsResearchBlock('Research', r, items, itemBlock)}`;
      }
      return { text: `${grading}\n\nWeekend pick candidates:\n${picked.map(itemBlock).join('\n\n') || '(choose from this week\'s stories)'}\n\nThis week's stories:\n${episodeDigest(lastWeek)}`, predictionGrades };
    }
  }
}

function showNotes(config: Config, description: string, stories: StoryRecord[], sources: Source[]): string {
  const seen = new Set(stories.map((s) => normalizeUrl(s.url)));
  const extra = sources.filter((s) => {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [
    description,
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

/** Today's skip check for scheduled runs. True when there is nothing to do. */
function alreadyPublished(published: EpisodeRecord[], date: string): boolean {
  if (env.SC_SKIP_IF_PUBLISHED !== 'true' || !published.some((e) => e.date === date)) return false;
  console.log(`[produce] episode for ${date} already published; nothing to do`);
  setOutput({ published: 'false', skipped: 'true' });
  run.skipped = true;
  return true;
}

/** The full text pipeline: feeds → selection → research → writing → content loop. Undefined when skipped. */
async function makeScript(config: Config, now: Date): Promise<SavedScript | undefined> {
  const tz = config.show.timezone;
  const weekday = showWeekday(now, tz, env.SC_WEEKDAY, config.schedule.extra_days);
  const format = config.schedule.weekdays[weekday];
  const minutes = env.SC_MINUTES ? Number(env.SC_MINUTES) : format.minutes;
  if (!(minutes > 0)) throw new Error(`SC_MINUTES must be a positive number, got "${env.SC_MINUTES}"`);
  const date = localDate(now, tz);
  const spoken = spokenDate(now, tz);
  const targetWords = Math.round(minutes * config.episode.words_per_minute);
  Object.assign(run, { date, weekday, segment: format.segment, minutes, targetWords, dryRun });
  const published = readHistory();
  if (alreadyPublished(published, date)) return undefined;
  // Re-making today's episode replaces it, so it doesn't count as the previous episode
  // (otherwise the news window would start at it and its stories would count as covered).
  const history = published.filter((e) => e.date !== date);
  if (history.length < published.length) console.log(`[produce] replacing today's published episode`);
  console.log(`[produce] ${date}, ${weekday} format (${format.segment}), ${minutes} min${dryRun ? ', dry run' : ''}`);

  stage = 'feeds';
  const from = windowStart(now, lastPublished(history), config.schedule.window_cap_days, config.schedule.first_run_hours);
  const covered = new Set(history.flatMap((e) => e.stories.map((s) => normalizeUrl(s.url))));
  const { items, results } = await collectNews(config, from, now, covered);
  const failed = results.filter((r) => !r.ok);
  run.window = { from: from.toISOString(), to: now.toISOString(), items: items.length };
  run.failedFeeds = failed.map((f) => `${f.name} (${f.error ?? 'failed'})`);
  writeSummary();
  console.log(`[feeds] ${items.length} items since ${from.toISOString()}; ${failed.length} feeds failed${failed.length ? `: ${failed.map((f) => f.name).join(', ')}` : ''}`);
  if (items.length < MIN_ITEMS) throw new Error(`Only ${items.length} news items in the window; not enough for an episode.`);
  const byId = new Map(items.map((i) => [i.id, i]));

  stage = 'markets';
  const { quotes, failures: quoteFailures } = await fetchQuotes(config);
  if (quoteFailures.length) console.warn(`[markets] unavailable: ${quoteFailures.join('; ')}`);

  stage = 'select';
  const notes = env.SC_NOTES?.trim() ?? '';
  const { selection, warnings } = await selectStories(config, format.segment, items, history, notes);
  console.log(`[select] main: ${selection.main.map((m) => byId.get(m.id)?.title).join(' | ')}`);
  const title = (id: string) => byId.get(id)?.title ?? '(unknown id)';
  run.stories = [
    ...selection.main.map((m, n) => ({ role: `main ${n + 1}`, id: m.id, title: title(m.id) })),
    ...selection.headlines.map((id) => ({ role: 'headline', id, title: title(id) })),
    ...selection.segment_items.map((id) => ({ role: 'segment', id, title: title(id) })),
    ...selection.quick_hits.map((id) => ({ role: 'quick hit', id, title: title(id) })),
  ];
  writeJson('selection.json', { selection, warnings, candidates: items.map((i) => ({ id: i.id, title: i.title, topic: i.topic, feed: i.feed })) });
  writeSummary();

  stage = 'research';
  const research: Research[] = [];
  const saveResearch = () => writeJson('research.json', research.map((r) => ({ topic: r.topic, notes: r.notes, sources: r.sources, articleChars: r.articleText.length })));
  const mainBlocks: string[] = [];
  for (const [n, main] of selection.main.entries()) {
    const item = byId.get(main.id)!;
    const r = await researchStory(config, item, main.angle, n === 0 && format.segment === 'deep_dive');
    research.push(r);
    saveResearch();
    mainBlocks.push(`== MAIN STORY ${n + 1} ==\nAngle: ${main.angle}${main.follow_up_of ? `\nFollow-up of: ${main.follow_up_of}` : ''}\n${itemBlock(item)}\n\n${researchBlock(r)}`);
  }
  const segment = config.segments[format.segment];
  const { text: segmentText, predictionGrades } = await segmentMaterial(config, format.segment, now, history, byId, selection, quotes, quoteFailures, research);
  saveResearch();
  writeSummary();
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
    targetWords,
    materials,
    producerNotes: notes,
  };
  writeFileSync(join(outDir, 'materials.md'), materials);

  stage = 'write';
  const first = await writeDraft(config, brief);
  stage = 'review';
  const { draft, sections, rounds, unresolved, chosenRound } = await contentLoop(config, brief, first, spoken, quotes);
  run.rounds = rounds;
  run.chosenRound = chosenRound;
  writeSummary();

  const pickedIds = [...new Set([...selection.main.map((m) => m.id), ...selection.headlines, ...selection.segment_items, ...selection.quick_hits])];
  const summaries = new Map(draft.story_summaries.map((s) => [s.id, s.summary]));
  const stories: StoryRecord[] = pickedIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [{ title: item.title, url: item.url, topic: item.topic, summary: summaries.get(id) ?? item.snippet.slice(0, 200) }] : [];
  });

  // Everything a voice-only rerun (SC_RESUME_SCRIPT) needs; notes.md sits next to it.
  const script: SavedScript = {
    date,
    weekday,
    segment: format.segment,
    targetMinutes: minutes,
    title: draft.title,
    description: draft.description,
    sections,
    stories,
    predictions: draft.predictions,
    open_threads: draft.open_threads,
    story_summaries: draft.story_summaries,
    ...(predictionGrades ? { predictionGrades } : {}),
    textModels: textBadges(modelUses()),
  };
  writeJson('script.json', script);
  writeFileSync(join(outDir, 'transcript.md'), `# ${draft.title}\n\n${transcript(sections)}\n`);
  writeFileSync(join(outDir, 'notes.md'), showNotes(config, draft.description, stories, research.flatMap((r) => r.sources)));
  writeFileSync(join(outDir, 'review.md'), reviewReport(rounds, selection, warnings));

  const critical = blocking(unresolved);
  if (critical.length) {
    console.warn(`[review] ${critical.length} critical issues remain:\n${formatIssues(critical)}`);
    if (!dryRun && config.quality.on_unresolved === 'stop') {
      throw new Error('Critical issues remain after the content loop (quality.on_unresolved = stop). See out/review.md.');
    }
  }
  return script;
}

/**
 * Voice-only rerun: the reviewed script from an earlier run (SC_RESUME_SCRIPT=<its script.json>), with the
 * notes.md next to it. No feeds, selection, research, writing or review. Undefined when skipped.
 */
function resumeScript(config: Config, now: Date, path: string): SavedScript | undefined {
  stage = 'resume';
  const today = localDate(now, config.show.timezone);
  const { script, notes } = loadResume(config, path, today, env.SC_RESUME_ALLOW_OTHER_DATE === 'true');
  Object.assign(run, {
    date: script.date,
    weekday: script.weekday,
    segment: script.segment,
    minutes: script.targetMinutes,
    targetWords: Math.round(script.targetMinutes * config.episode.words_per_minute),
    dryRun,
    resumedFrom: path,
  });
  if (alreadyPublished(readHistory(), script.date)) return undefined;
  console.log(`[produce] resuming from ${path}: "${script.title}" (${script.date}, ${script.weekday}), voicing only${dryRun ? ', dry run' : ''}`);
  if (!notes) console.warn(`::warning::No notes.md next to ${path}; show notes rebuilt from the script's stories.`);
  writeJson('script.json', script);
  writeFileSync(join(outDir, 'transcript.md'), `# ${script.title}\n\n${transcript(script.sections)}\n`);
  writeFileSync(join(outDir, 'notes.md'), notes ?? showNotes(config, script.description, script.stories, []));
  return script;
}

async function main(): Promise<void> {
  stage = 'config';
  const config = loadConfig();
  const now = new Date();
  const resume = env.SC_RESUME_SCRIPT?.trim();
  const script = resume ? resumeScript(config, now, resume) : await makeScript(config, now);
  if (!script) return;
  if (dryRun) {
    const read = resume ? `${outDir}/transcript.md` : `${outDir}/review.md and ${outDir}/transcript.md`;
    console.log(`[produce] dry run done: "${script.title}". Read ${read}.`);
    setOutput({ published: 'false' });
    return;
  }
  const { date, sections, targetMinutes: minutes } = script;

  stage = 'tts';
  const chunks = chunkForTts(sections, config.tts.max_chars_per_request);
  const ttsLog: ChunkReport[] = [];
  let voiced: Awaited<ReturnType<typeof speakAll>>;
  try {
    voiced = await speakAll(config, chunks, ttsLog);
  } finally {
    run.tts = ttsLog;
    writeJson('tts.json', ttsLog);
  }
  run.ttsModel = voiced.model;
  writeSummary();

  stage = 'assemble';
  const file = audioFileName(date, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  const mp3 = join(outDir, file);
  assembleEpisode(config, voiced.parts, outDir, mp3, { title: script.title, artist: config.show.author });

  stage = 'reconcile';
  const exact = probeSeconds(mp3);
  const problems = reconcile({
    mp3Seconds: exact,
    introSeconds: wavSeconds(readFileSync(config.audio.intro)),
    outroSeconds: wavSeconds(readFileSync(config.audio.outro)),
    chunkSeconds: voiced.parts.map(wavSeconds),
    gapSeconds: config.audio.gap_ms / 1000,
    targetMinutes: minutes,
  });
  if (problems.length) throw new Error(`Episode audio failed its checks; not publishing a broken episode:\n- ${problems.join('\n- ')}`);
  const duration = Math.round(exact);
  const target = minutes * 60;
  if (Math.abs(duration - target) / target > config.audio.length_warning_tolerance) {
    console.warn(`::warning::Episode is ${Math.round(duration / 60)} min; target is ${minutes} min.`);
  }
  Object.assign(run, { file, durationSeconds: duration });

  stage = 'meta';
  const tag = `ep-${date}`;
  const meta = {
    date,
    publishedAt: now.toISOString(),
    weekday: script.weekday,
    segment: script.segment,
    title: script.title,
    description: script.description,
    file,
    tag,
    bytes: statSync(mp3).size,
    durationSeconds: duration,
    targetMinutes: minutes,
    ttsModel: voiced.model,
    models: episodeBadges(script.textModels, voiced.model),
    stories: script.stories,
    predictions: script.predictions,
    openThreads: script.open_threads,
    ...(script.predictionGrades ? { predictionGrades: script.predictionGrades } : {}),
    ...(resume ? { resumedFrom: resume } : {}),
  };
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  setOutput({ published: 'true', tag, file, title: script.title.replaceAll('\n', ' ') });
  console.log(`[produce] ${file}: ${Math.round(duration / 60)} min, ${chunks.length} TTS requests, ${voiced.model}`);
}

mkdirSync(outDir, { recursive: true });
// A meta.json left from an earlier run must never be published as this run's.
rmSync(join(outDir, 'meta.json'), { force: true });
rmSync(join(outDir, 'error.txt'), { force: true });
try {
  await main();
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[produce] failed in ${stage}: ${message}`);
  run.failure = { stage, message: err instanceof Error ? err.message : String(err) };
  const hint = failureHint(message);
  writeFileSync(join(outDir, 'error.txt'), `stage: ${stage}${hint ? ` | ${hint}` : ''}\n${message}\n`);
  process.exitCode = 1;
} finally {
  writeSummary();
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, readFileSync(join(outDir, 'summary.md'), 'utf8'));
}
