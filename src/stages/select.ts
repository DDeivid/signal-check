import { z } from 'zod';
import { type Config, type SegmentId, isCoreTopic } from '../config';
import type { FeedItem } from '../feeds';
import type { EpisodeRecord } from '../history';
import { generateJson } from '../llm';

export const selectionSchema = z.object({
  headlines: z.array(z.string()),
  main: z.array(z.object({ id: z.string(), angle: z.string(), follow_up_of: z.string().nullish() })),
  quick_hits: z.array(z.string()),
  segment_items: z.array(z.string()),
  notes: z.string().default(''),
});
export type Selection = z.infer<typeof selectionSchema>;

const PER_TOPIC = 25;

/** At most PER_TOPIC newest items per topic, so one busy feed can't crowd out the rest. */
export function shortlist(items: FeedItem[]): FeedItem[] {
  const counts = new Map<string, number>();
  return items.filter((i) => {
    const n = counts.get(i.topic) ?? 0;
    counts.set(i.topic, n + 1);
    return n < PER_TOPIC;
  });
}

const SEGMENT_PICKS: Record<SegmentId, string> = {
  look_back: 'segment_items: 0-3 ids of weekend stories that update something from last week (can be empty).',
  deep_dive: 'segment_items: empty. The deep dive covers the first main story, so pick a main story with real depth.',
  far_field: 'segment_items: exactly 1 id from an OUTSIDE topic, the most interesting story for someone who never reads about it.',
  markets: 'segment_items: 1-3 ids of market or economy stories that explain this week\'s moves.',
  prediction_check: 'segment_items: 1-3 ids that would make good weekend picks (games, long reads, projects to try).',
};

export function selectionPrompt(config: Config, segment: SegmentId, items: FeedItem[], history: EpisodeRecord[], notes: string): string {
  const core = config.topics.core.map((t) => `${t.id} (${t.label})`).join(', ');
  const outsideTarget = Math.round((1 - config.topics.core_share) * 100);
  const list = items
    .map((i) => {
      const bucket = isCoreTopic(config, i.topic) ? i.topic : `OUTSIDE:${i.topic}`;
      return `${i.id} [${bucket}] (${i.feed}, ${i.published.toISOString().slice(0, 10)}) ${i.title} — ${i.snippet.slice(0, 220)}`;
    })
    .join('\n');
  const past = history
    .slice(-10)
    .map((e) => `Episode ${e.number} (${e.date}): ${e.stories.map((s) => s.title).join(' | ')}${e.openThreads.length ? ` || open threads: ${e.openThreads.join('; ')}` : ''}`)
    .join('\n');

  return `Pick today's stories for ${config.show.title}.

Core topics: ${core}.
About ${outsideTarget}% of the picked stories (counting headlines, main stories, quick hits and segment items) must come from OUTSIDE topics, so the listener doesn't live in a filter bubble.

Pick:
- headlines: ${config.episode.headlines} ids, the most important things across all topics. They may include the main stories.
- main: ${config.episode.main_stories} stories that deserve 2-3 minutes each, each from a different topic. Favour stories with consequences, a real disagreement, or a development of something covered before. For each, give a one-sentence angle. If it continues a story from a past episode, set follow_up_of to e.g. "Episode 12: <story title>".
- quick_hits: ${config.episode.quick_hits} ids not used as main stories, short and varied.
- ${SEGMENT_PICKS[segment]}
- notes: one or two sentences on your reasoning.

Avoid: press releases, listicles, deals and shopping posts, stories already covered unless there is real news, duplicates of the same event from different outlets.
${notes ? `\nProducer notes for today: ${notes}\n` : ''}
Past episodes:
${past || '(none yet)'}

Candidates:
${list}

Return JSON: {"headlines": ["s1"], "main": [{"id": "s2", "angle": "...", "follow_up_of": null}], "quick_hits": ["s3"], "segment_items": [], "notes": "..."}`;
}

export interface Problem {
  /** main: the main stories are unusable, which fails the run if the second pick has it too. */
  kind: 'main' | 'far_field' | 'share';
  text: string;
}

export interface CheckedSelection {
  /** The pick with unknown/duplicate supporting ids dropped and counts trimmed. */
  selection: Selection;
  /** What was dropped or trimmed. */
  warnings: string[];
  /** What needs a new pick. */
  problems: Problem[];
}

/**
 * Checks and cleans a pick. Only the main stories can make it unusable: the right number, known ids,
 * no id twice, each from a different topic. Unknown or repeated ids in headlines, quick hits and segment
 * items are dropped with a warning, quick hits that repeat a main story too, and extra headlines and quick
 * hits are trimmed to the configured counts. On far_field days the segment item must be from an outside topic.
 */
export function checkSelection(config: Config, segment: SegmentId, selection: Selection, items: FeedItem[]): CheckedSelection {
  const byId = new Map(items.map((i) => [i.id, i]));
  const warnings: string[] = [];
  const problems: Problem[] = [];
  const main = (text: string) => problems.push({ kind: 'main', text });

  const mainIds = selection.main.map((m) => m.id);
  if (selection.main.length !== config.episode.main_stories) main(`need exactly ${config.episode.main_stories} main stories, got ${selection.main.length}`);
  for (const id of mainIds) if (!byId.has(id)) main(`unknown main story id ${id}`);
  if (new Set(mainIds).size < mainIds.length) main('the same main story is picked twice');
  const mainTopics = mainIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!.topic] : []));
  if (new Set(mainTopics).size < mainTopics.length) main(`main stories must come from different topics (got ${mainTopics.join(', ')})`);

  const clean = (ids: string[], name: string, exclude = new Set<string>()): string[] => {
    const seen = new Set<string>();
    return ids.filter((id) => {
      let why = '';
      if (!byId.has(id)) why = 'unknown id';
      else if (seen.has(id)) why = 'listed twice';
      else if (exclude.has(id)) why = 'it is a main story';
      seen.add(id);
      if (why) warnings.push(`dropped ${name} ${id}: ${why}`);
      return !why;
    });
  };
  const trim = (ids: string[], name: string, max: number): string[] => {
    if (ids.length > max) warnings.push(`trimmed ${name} from ${ids.length} to ${max}: dropped ${ids.slice(max).join(', ')}`);
    return ids.slice(0, max);
  };
  const headlines = trim(clean(selection.headlines, 'headline'), 'headlines', config.episode.headlines);
  const quickHits = trim(clean(selection.quick_hits, 'quick hit', new Set(mainIds)), 'quick hits', config.episode.quick_hits);
  let segmentItems = clean(selection.segment_items, 'segment item');

  if (segment === 'far_field') {
    const outside = segmentItems.filter((id) => !isCoreTopic(config, byId.get(id)!.topic));
    if (!outside.length) problems.push({ kind: 'far_field', text: 'the far-field segment item must come from an OUTSIDE topic' });
    else {
      if (segmentItems.length > 1 || outside[0] !== segmentItems[0]) warnings.push(`far field: kept ${outside[0]}, dropped ${segmentItems.filter((id) => id !== outside[0]).join(', ')}`);
      segmentItems = [outside[0]!];
    }
  }
  return { selection: { ...selection, headlines, quick_hits: quickHits, segment_items: segmentItems }, warnings, problems };
}

/** The newest outside-topic item not already used as a main story or quick hit (any outside item if all are used). */
export function newestOutside(config: Config, selection: Selection, items: FeedItem[]): FeedItem | undefined {
  const used = new Set([...selection.main.map((m) => m.id), ...selection.quick_hits]);
  const outside = items.filter((i) => !isCoreTopic(config, i.topic)).sort((a, b) => b.published.getTime() - a.published.getTime());
  return outside.find((i) => !used.has(i.id)) ?? outside[0];
}

/** Share of distinct picked stories that come from outside the core topics. */
export function outsideShare(config: Config, selection: Selection, items: FeedItem[]): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  const picked = new Set([...selection.headlines, ...selection.main.map((m) => m.id), ...selection.quick_hits, ...selection.segment_items]);
  const topics = [...picked].flatMap((id) => (byId.has(id) ? [byId.get(id)!.topic] : []));
  if (!topics.length) return 0;
  return topics.filter((t) => !isCoreTopic(config, t)).length / topics.length;
}

export async function selectStories(
  config: Config,
  segment: SegmentId,
  items: FeedItem[],
  history: EpisodeRecord[],
  notes: string,
): Promise<{ selection: Selection; warnings: string[] }> {
  const candidates = shortlist(items);
  const system = 'You are the news editor of a daily podcast. You choose carefully and return only JSON.';
  let prompt = selectionPrompt(config, segment, candidates, history, notes);
  const warnings: string[] = [];
  const target = 1 - config.topics.core_share;
  for (let attempt = 1; ; attempt++) {
    const raw = await generateJson(config, { label: 'select', system, prompt, temperature: 0.4 }, selectionSchema);
    const checked = checkSelection(config, segment, raw, candidates);
    let selection = checked.selection;
    const problems = [...checked.problems];
    const share = outsideShare(config, selection, candidates);
    if (share < target - 0.1) problems.push({ kind: 'share', text: `only ${Math.round(share * 100)}% of picks are from outside topics; target is ${Math.round(target * 100)}%` });
    for (const w of checked.warnings) console.warn(`[select] ${w}`);
    if (!problems.length) return { selection, warnings: [...warnings, ...checked.warnings] };
    if (attempt >= 2) {
      const fatal = problems.filter((p) => p.kind === 'main');
      if (fatal.length) throw new Error(`Story selection failed: ${fatal.map((p) => p.text).join('; ')}`);
      warnings.push(...checked.warnings, ...problems.map((p) => p.text));
      if (problems.some((p) => p.kind === 'far_field')) {
        const fallback = newestOutside(config, selection, candidates);
        selection = { ...selection, segment_items: fallback ? [fallback.id] : [] };
        warnings.push(fallback ? `far field: fell back to the newest outside-topic item, ${fallback.id}` : 'far field: no outside-topic item available');
      }
      return { selection, warnings };
    }
    const text = problems.map((p) => p.text).join('; ');
    console.warn(`[select] fixing: ${text}`);
    prompt = `${prompt}\n\nYour previous pick had problems: ${text}. Pick again.`;
  }
}
