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
- main: ${config.episode.main_stories} stories that deserve 2-3 minutes each. Favour stories with consequences, a real disagreement, or a development of something covered before. For each, give a one-sentence angle. If it continues a story from a past episode, set follow_up_of to e.g. "Episode 12: <story title>".
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

export function validateSelection(config: Config, selection: Selection, items: FeedItem[]): string[] {
  const ids = new Set(items.map((i) => i.id));
  const problems: string[] = [];
  const all = [...selection.headlines, ...selection.main.map((m) => m.id), ...selection.quick_hits, ...selection.segment_items];
  for (const id of all) if (!ids.has(id)) problems.push(`unknown id ${id}`);
  if (selection.main.length !== config.episode.main_stories) problems.push(`need exactly ${config.episode.main_stories} main stories`);
  const mainIds = new Set(selection.main.map((m) => m.id));
  if (selection.quick_hits.some((id) => mainIds.has(id))) problems.push('quick hits repeat a main story');
  return problems;
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
    const selection = await generateJson(config, { label: 'select', system, prompt, temperature: 0.4 }, selectionSchema);
    const problems = validateSelection(config, selection, candidates);
    const share = outsideShare(config, selection, candidates);
    if (share < target - 0.1) problems.push(`only ${Math.round(share * 100)}% of picks are from outside topics; target is ${Math.round(target * 100)}%`);
    if (!problems.length) return { selection, warnings };
    if (attempt >= 2) {
      const fatal = problems.filter((p) => !p.includes('outside topics'));
      if (fatal.length) throw new Error(`Story selection failed: ${fatal.join('; ')}`);
      warnings.push(...problems);
      return { selection, warnings };
    }
    console.warn(`[select] fixing: ${problems.join('; ')}`);
    prompt = `${prompt}\n\nYour previous pick had problems: ${problems.join('; ')}. Pick again.`;
  }
}
