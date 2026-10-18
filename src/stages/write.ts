import type { Config, SegmentId } from '../config';
import { generateJson } from '../llm';
import { type Draft, draftSchema, numberedScript, SECTION_IDS, type Section } from '../script';

export interface Brief {
  weekday: string;
  date: string;
  segment: SegmentId;
  targetWords: number;
  /** Everything the hosts may say, with sources. Shared with the fact-checker. */
  materials: string;
  producerNotes: string;
}

const SHARES: Record<(typeof SECTION_IDS)[number], number> = {
  headlines: 0.1,
  main_1: 0.27,
  main_2: 0.23,
  segment: 0.28,
  quick_hits: 0.12,
};

export function wordBudget(targetWords: number): Record<(typeof SECTION_IDS)[number], number> {
  return Object.fromEntries(SECTION_IDS.map((id) => [id, Math.round(targetWords * SHARES[id])])) as Record<
    (typeof SECTION_IDS)[number],
    number
  >;
}

export function systemPrompt(config: Config): string {
  const [a, b] = config.hosts;
  return `You write ${config.show.title}, a weekday news podcast in ${config.show.language === 'en' ? 'English' : config.show.language}: ${config.show.tagline}
Two AI hosts:
- ${a!.name}: ${a!.persona}
- ${b!.name}: ${b!.persona}

How it sounds:
- A real conversation between two people who read the news closely. Short turns, mostly 1-4 sentences. They react to each other, disagree sometimes, and hand off naturally.
- Spoken English, the way people actually talk: contractions (it's, they're, we'll), "the US" not "the United States" every time, no "let us examine". No headings read aloud, no stage directions, no sound effects, no emojis, no markdown.
- Attribute claims ("according to the BBC", "the company says"). Separate what is known from what is claimed or guessed.
- Facts about the news come only from the materials. Never invent numbers, quotes, names or dates. Short, well-established background (what a product is, a standard term) is fine, but don't add specific background numbers such as prices or counts that aren't in the materials, and describe each article as what it actually reports.
- Market numbers come only from the market table, written as digits. Never give investment advice.
- When a story continues one from an earlier episode, say so briefly ("we covered this on Tuesday").
- No clichés or filler: ${config.quality.banned_phrases.map((p) => `"${p}"`).join(', ')}.
- Speaker names must be exactly "${a!.name}" or "${b!.name}".
- Voice direction: ${a!.name} sounds ${a!.delivery || 'natural'}; ${b!.name} sounds ${b!.delivery || 'natural'}. A line may carry an optional "delivery" cue of 1-4 words (e.g. "amused", "serious", "surprised", "slower, emphatic") where it should sound different from that default. Use it sparingly, on maybe one line in six. Never put directions inside "text".
Return only JSON.`;
}

export function writerPrompt(config: Config, brief: Brief): string {
  const budget = wordBudget(brief.targetWords);
  const segment = config.segments[brief.segment];
  return `Write the script for ${brief.weekday}, ${brief.date}. Length matters: about ${brief.targetWords} spoken words in total. Each section's word count below is a minimum, not a ceiling; a short script is the most common failure, so use the detail in the materials.
The fixed opening and closing lines are added separately; start right after the hosts have introduced themselves.

Sections, in this order (id, then target words):
1. headlines (~${budget.headlines}): a fast rundown, one or two sentences each. Only tease stories that are covered later in this episode.
2. main_1 (~${budget.main_1}): first main story.
3. main_2 (~${budget.main_2}): second main story.
4. segment (~${budget.segment}): "${segment.title}". ${segment.brief}
5. quick_hits (~${budget.quick_hits}): the quick hits, one or two sentences each.

Give each section a short title for the show notes (the segment's title is "${segment.title}").
Also return:
- title: an episode title under 70 characters, specific, no clickbait.
- description: two or three sentences for the show notes.
- predictions: 0-2 concrete, checkable predictions a host actually makes in the script, e.g. {"text": "The vote passes before Friday", "by": "Theo"}. Only include predictions that are spoken in the script.
- open_threads: stories worth following up later, one line each.
- story_summaries: for each story id you cover, a one-sentence summary and a short label for the episode's story list (2 to 6 words, plain, no clickbait, no source name): {"id": "s4", "summary": "...", "label": "Torvalds' first AI-assisted patch"}.
${brief.producerNotes ? `\nProducer notes for today (follow them): ${brief.producerNotes}\n` : ''}
MATERIALS
${brief.materials}

Return JSON:
{"title": "...", "description": "...", "sections": [{"id": "headlines", "title": "Headlines", "lines": [{"speaker": "${config.hosts[0]!.name}", "text": "..."}, {"speaker": "${config.hosts[1]!.name}", "text": "...", "delivery": "amused"}]}], "predictions": [], "open_threads": [], "story_summaries": []}`;
}

export async function writeDraft(config: Config, brief: Brief): Promise<Draft> {
  return generateJson(config, { label: 'write', system: systemPrompt(config), prompt: writerPrompt(config, brief) }, draftSchema);
}

export function revisePrompt(config: Config, brief: Brief, draft: Draft, sections: Section[], issues: string): string {
  return `${writerPrompt(config, brief)}

CURRENT DRAFT
${JSON.stringify(draft)}

NUMBERED SCRIPT
The same draft as it will be read, with the fixed opening and closing included. The line numbers in the issues refer to this numbering.
${numberedScript(sections)}

The review found these issues. Fix every one of them. Keep everything else that works; don't shorten good material unless asked.
Fix a line's issue by replacing that line in the JSON, not by adding a new line next to it (that is how repeated lines creep in). Only add lines where an issue asks for more material. Don't write the opening or closing lines.
${issues}

Return the complete revised script in the same JSON shape.`;
}

export async function reviseDraft(config: Config, brief: Brief, draft: Draft, sections: Section[], issues: string): Promise<Draft> {
  const prompt = revisePrompt(config, brief, draft, sections, issues);
  return generateJson(config, { label: 'revise', system: systemPrompt(config), prompt, temperature: 0.5 }, draftSchema);
}
