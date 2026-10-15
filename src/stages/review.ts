import { z } from 'zod';
import type { Config } from '../config';
import { generateJson } from '../llm';
import type { Quote } from '../markets';
import { type Draft, type Section, numberedScript, SECTION_IDS, sectionWords, words } from '../script';
import { type Brief, reviseDraft } from './write';

export const issueSchema = z.object({
  line: z.number().int().nullish(),
  severity: z.enum(['critical', 'major', 'minor']),
  problem: z.string(),
  fix: z.string(),
});
export type Issue = z.infer<typeof issueSchema> & { source: 'rules' | 'fact-check' };

export interface ReviewRound {
  round: number;
  words: number;
  issues: Issue[];
}

/** Full running order: fixed opening, the draft's sections in canonical order, fixed closing. */
export function assembleSections(config: Config, draft: Draft, spoken: { weekday: string; date: string }): Section[] {
  const fill = (text: string) => text.replaceAll('{weekday}', spoken.weekday).replaceAll('{date}', spoken.date);
  const order = (id: string) => SECTION_IDS.indexOf(id as (typeof SECTION_IDS)[number]);
  return [
    { id: 'opening', title: 'Opening', lines: config.show.opening.map((l) => ({ ...l, text: fill(l.text) })) },
    ...[...draft.sections].sort((a, b) => order(a.id) - order(b.id)),
    { id: 'closing', title: 'Closing', lines: config.show.closing.map((l) => ({ ...l, text: fill(l.text) })) },
  ];
}

/** Numbers in `text` that don't match any value in the market table (closes and absolute % changes). */
export function unmatchedMarketNumbers(text: string, quotes: Quote[]): string[] {
  // Numbers inside instrument names ("S&P 500", "Nasdaq 100") aren't market figures.
  for (const q of quotes) text = text.replaceAll(q.label, ' ');
  const values = quotes.flatMap((q) => [q.close, q.dayChangePct, q.weekChangePct].filter((v): v is number => v !== null).map(Math.abs));
  const tokens = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return tokens.filter((token) => {
    const n = Number(token.replaceAll(',', ''));
    const decimals = token.split('.')[1]?.length ?? 0;
    if (!decimals && n < 10) return false;
    if (!decimals && n >= 1900 && n <= 2100) return false;
    return !values.some((v) => Math.abs(v - n) <= 0.5 * 10 ** -decimals + 1e-9 || (n >= 100 && Math.abs(v - n) / v <= 0.005));
  });
}

export function ruleIssues(config: Config, sections: Section[], targetWords: number, segment: string, quotes: Quote[]): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], problem: string, fix: string, line?: number) =>
    issues.push({ source: 'rules', severity, problem, fix, line });
  const hosts = config.hosts.map((h) => h.name);

  const total = sectionWords(sections);
  const off = (total - targetWords) / targetWords;
  if (Math.abs(off) > config.quality.length_tolerance) {
    add('major', `Script is ${total} words; target is ${targetWords}.`, off < 0 ? `Add about ${targetWords - total} words of substance.` : `Cut about ${total - targetWords} words.`);
  }

  const present = new Set(sections.map((s) => s.id));
  const required = SECTION_IDS.filter((id) => {
    if (id === 'headlines') return config.episode.headlines > 0;
    if (id === 'quick_hits') return config.episode.quick_hits > 0;
    if (id === 'main_2') return config.episode.main_stories > 1;
    return true;
  });
  for (const id of required) if (!present.has(id)) add('major', `Section "${id}" is missing.`, `Add the ${id} section.`);

  const wordsBy = new Map<string, number>();
  let n = 0;
  for (const section of sections) {
    for (const line of section.lines) {
      n++;
      if (!hosts.includes(line.speaker)) add('critical', `Unknown speaker "${line.speaker}".`, `Use only ${hosts.join(' or ')}.`, n);
      wordsBy.set(line.speaker, (wordsBy.get(line.speaker) ?? 0) + words(line.text));
      if (words(line.text) > config.quality.max_line_words) add('major', 'Line is too long for natural conversation.', 'Split it into a back-and-forth.', n);
      for (const phrase of config.quality.banned_phrases) {
        if (line.text.toLowerCase().includes(phrase.toLowerCase())) add('major', `Banned phrase "${phrase}".`, 'Rephrase without it.', n);
      }
    }
  }
  for (const host of hosts) {
    const share = (wordsBy.get(host) ?? 0) / Math.max(total, 1);
    if (share < 0.3) add('major', `${host} has only ${Math.round(share * 100)}% of the words.`, `Give ${host} a bigger part.`);
  }

  if (segment === 'markets') {
    const text = sections.find((s) => s.id === 'segment')?.lines.map((l) => l.text).join(' ') ?? '';
    const bad = unmatchedMarketNumbers(text, quotes);
    if (bad.length) add('critical', `Market segment numbers not in the market table: ${bad.join(', ')}.`, 'Use only numbers from the market table, or drop them.');
  }
  return issues;
}

const factCheckSchema = z.object({ issues: z.array(issueSchema) });

export async function factCheck(config: Config, brief: Brief, sections: Section[]): Promise<Issue[]> {
  const system = 'You are a strict fact-checker and editor for a news podcast. You compare scripts against source material and return only JSON.';
  const prompt = `Check this podcast script against the materials. The script may only state as fact what the materials support.

Report:
- critical: a claim contradicted by the materials, a number, name, date or quote not in the materials, or a claim attributed to the wrong source.
- major: speculation presented as fact, a missing caveat that changes the meaning, one-sided framing of a contested story, or investment advice.
- minor: clarity or flow problems worth fixing.
Ignore the fixed opening and closing lines. Don't report things that are fine. Each issue gives the line number, the problem and a concrete fix.

MATERIALS
${brief.materials}

SCRIPT
${numberedScript(sections)}

Return JSON: {"issues": [{"line": 12, "severity": "critical", "problem": "...", "fix": "..."}]}`;
  const { issues } = await generateJson(config, { label: 'fact-check', system, prompt, temperature: 0.1 }, factCheckSchema);
  return issues.map((i) => ({ ...i, source: 'fact-check' as const }));
}

export const needsRevision = (issues: Issue[]) => issues.some((i) => i.severity !== 'minor');
export const blocking = (issues: Issue[]) => issues.filter((i) => i.severity === 'critical');

export function formatIssues(issues: Issue[]): string {
  return issues
    .map((i) => `- [${i.severity}] ${i.line ? `line ${i.line}: ` : ''}${i.problem} Fix: ${i.fix} (${i.source})`)
    .join('\n');
}

/**
 * The content loop: rules + fact-check, then revise with the concrete issues, up to max_revisions times.
 * Returns the final draft and every round, so the review can be read afterwards.
 */
export async function contentLoop(
  config: Config,
  brief: Brief,
  first: Draft,
  spoken: { weekday: string; date: string },
  quotes: Quote[],
): Promise<{ draft: Draft; sections: Section[]; rounds: ReviewRound[]; unresolved: Issue[] }> {
  let draft = first;
  const rounds: ReviewRound[] = [];
  for (let round = 1; ; round++) {
    const sections = assembleSections(config, draft, spoken);
    const rules = ruleIssues(config, sections, brief.targetWords, brief.segment, quotes);
    const issues = [...rules, ...(await factCheck(config, brief, sections))];
    rounds.push({ round, words: sectionWords(sections), issues });
    console.log(`[review] round ${round}: ${sectionWords(sections)} words, ${issues.length} issues (${blocking(issues).length} critical)`);
    if (!needsRevision(issues) || round > config.quality.max_revisions) {
      return { draft, sections, rounds, unresolved: issues.filter((i) => i.severity !== 'minor') };
    }
    draft = await reviseDraft(config, brief, draft, formatIssues(issues.filter((i) => i.severity !== 'minor')));
  }
}
