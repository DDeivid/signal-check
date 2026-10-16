import { z } from 'zod';
import type { Config } from '../config';
import { generateJson } from '../llm';
import type { Quote } from '../markets';
import { type Draft, normalizeLine, type Section, numberedScript, SECTION_IDS, sectionWords, words } from '../script';
import { type Brief, reviseDraft } from './write';

export const issueSchema = z.object({
  line: z.number().int().nullish(),
  severity: z.enum(['critical', 'major', 'minor']),
  problem: z.string(),
  fix: z.string(),
});
export type Issue = z.infer<typeof issueSchema> & { source: 'rules' | 'fact-check' | 'pipeline' };

export interface ReviewRound {
  round: number;
  words: number;
  issues: Issue[];
  /** Set when this round's revise or fact-check call failed; the round doesn't count as reviewed. */
  error?: string;
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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "S&P 500" also matches "s&p-500" and "S&P500"; "EUR/USD" also "eur-usd". */
function labelPattern(label: string): RegExp {
  const parts = label.split(/[\s/-]+/).filter(Boolean).map(escapeRegExp);
  return new RegExp(`${parts.join('[\\s/-]?')}(?![\\d])`, 'gi');
}

const HEDGE = /\b(?:about|around|roughly|nearly|almost)\s+[$€£]?$/i;
const HEDGE_TOLERANCE = 0.02;

/**
 * Numbers in the text that don't match the market table (closes and absolute % changes). `labels` are all configured instrument names
 * (config.markets.instruments), stripped even when their quote wasn't fetched today.
 * Not market figures: numbers in instrument names, dates, times (8:30), ordinals (17th), years,
 * "5-day"/"two week"-style durations, and small integers. "About/around/roughly/nearly/almost N" may be
 * up to 2% off a table value.
 */
export function unmatchedMarketNumbers(text: string, quotes: Quote[], labels: string[] = []): string[] {
  for (const label of [...new Set([...labels, ...quotes.map((q) => q.label)])]) text = text.replace(labelPattern(label), ' ');
  const month = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
  text = text.replace(new RegExp(`${month}\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)?\\s+${month}`, 'g'), ' ');
  text = text.replace(/\b\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?/gi, ' ');
  text = text.replace(/\b\d+(?:st|nd|rd|th)\b/gi, ' ');
  text = text.replace(/\b\d+[\s-](?:trading[\s-])?(?:sessions?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi, ' ');
  const values = quotes.flatMap((q) => [q.close, q.dayChangePct, q.weekChangePct].filter((v): v is number => v !== null).map(Math.abs));
  const bad: string[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const token = m[0];
    const n = Number(token.replaceAll(',', ''));
    const decimals = token.split('.')[1]?.length ?? 0;
    if (!decimals && n < 10) continue;
    if (!decimals && n >= 1900 && n <= 2100) continue;
    const hedged = HEDGE.test(text.slice(0, m.index));
    const matches = values.some(
      (v) => Math.abs(v - n) <= 0.5 * 10 ** -decimals + 1e-9 || (n >= 100 && Math.abs(v - n) / v <= 0.005) || (hedged && Math.abs(v - n) <= HEDGE_TOLERANCE * v + 1e-9),
    );
    if (!matches) bad.push(token);
  }
  return bad;
}

export function ruleIssues(config: Config, sections: Section[], targetWords: number, segment: string, quotes: Quote[]): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], problem: string, fix: string, line?: number) =>
    issues.push({ source: 'rules', severity, problem, fix, line });
  const hosts = config.hosts.map((h) => h.name);

  const total = sectionWords(sections);
  const off = (total - targetWords) / targetWords;
  if (Math.abs(off) > config.quality.length_tolerance) {
    // Under half the target is an episode that would be published far too short: blocking.
    add(total < targetWords / 2 ? 'critical' : 'major', `Script is ${total} words; target is ${targetWords}.`, off < 0 ? `Add about ${targetWords - total} words of substance.` : `Cut about ${total - targetWords} words.`);
  }

  const present = new Set(sections.map((s) => s.id));
  const required = SECTION_IDS.filter((id) => {
    if (id === 'headlines') return config.episode.headlines > 0;
    if (id === 'quick_hits') return config.episode.quick_hits > 0;
    if (id === 'main_2') return config.episode.main_stories > 1;
    return true;
  });
  for (const id of required) if (!present.has(id)) add('critical', `Section "${id}" is missing.`, `Add the ${id} section.`);

  const wordsBy = new Map<string, number>();
  const seen = new Map<string, number>();
  let n = 0;
  for (const section of sections) {
    for (const line of section.lines) {
      n++;
      const key = normalizeLine(line.text);
      const first = seen.get(key);
      if (first !== undefined) add('critical', `Line repeats line ${first}.`, 'Replace this line with new material or remove it.', n);
      else seen.set(key, n);
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
    const bad = unmatchedMarketNumbers(text, quotes, config.markets.instruments.map((i) => i.label));
    if (bad.length) add('critical', `Market segment numbers not in the market table: ${bad.join(', ')}.`, 'Use only numbers from the market table, or drop them.');
  }
  return issues;
}

const factCheckSchema = z.object({ issues: z.array(issueSchema) });

export async function factCheck(config: Config, brief: Brief, sections: Section[]): Promise<Issue[]> {
  const system = 'You are a strict fact-checker and editor for a news podcast. You compare scripts against source material and return only JSON.';
  const prompt = `Check this podcast script against the materials. Claims about the news itself must be supported by the materials; well-established general background (what a well-known product is, standard scientific terms, widely known history) may come from general knowledge.

Report:
- critical: a claim about the news that the materials contradict; getting the story wrong (who did what, what an article is actually about); a claim attributed to the wrong source; or a number, quote, name or date about the news event that isn't in the materials.
- major: speculation presented as fact, a missing caveat that changes the meaning, one-sided framing of a contested story, investment advice, or a specific background number (a price, a count, a percentage) that isn't in the materials.
- minor: well-established background that simply isn't in the materials (note it, don't block on it), and clarity or flow problems worth fixing.
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

const count = (issues: Issue[], severity: Issue['severity']) => issues.filter((i) => i.severity === severity).length;

/** The best reviewed draft: fewest critical issues, then fewest major issues, then the latest. */
export function bestReviewed<T extends { round: number; issues: Issue[] }>(reviewed: T[]): T {
  if (!reviewed.length) throw new Error('no reviewed draft');
  return reviewed.reduce((best, r) => {
    const byCritical = count(r.issues, 'critical') - count(best.issues, 'critical');
    const byMajor = count(r.issues, 'major') - count(best.issues, 'major');
    return byCritical < 0 || (byCritical === 0 && (byMajor < 0 || (byMajor === 0 && r.round >= best.round))) ? r : best;
  });
}

export interface LoopResult {
  draft: Draft;
  sections: Section[];
  rounds: ReviewRound[];
  unresolved: Issue[];
  /** The round whose draft was kept. */
  chosenRound: number;
}

/**
 * The content loop: rules + fact-check, then revise with the concrete issues, up to max_revisions times.
 * Keeps the best reviewed draft, not simply the last. A revise or fact-check failure after a complete
 * round keeps that best draft and is recorded as a major issue; before one, it fails the run.
 */
export async function contentLoop(config: Config, brief: Brief, first: Draft, spoken: { weekday: string; date: string }, quotes: Quote[]): Promise<LoopResult> {
  let draft = first;
  const rounds: ReviewRound[] = [];
  const reviewed: Array<{ round: number; draft: Draft; sections: Section[]; issues: Issue[] }> = [];
  const finish = (extra: Issue[] = []): LoopResult => {
    const best = bestReviewed(reviewed);
    if (best.round !== reviewed.at(-1)!.round) console.log(`[review] keeping the draft from round ${best.round}`);
    return { draft: best.draft, sections: best.sections, rounds, unresolved: [...best.issues.filter((i) => i.severity !== 'minor'), ...extra], chosenRound: best.round };
  };
  const failed = (round: number, step: string, err: unknown): LoopResult => {
    const message = (err as Error)?.message ?? String(err);
    const issue: Issue = { source: 'pipeline', severity: 'major', problem: `The ${step} call failed in round ${round}: ${message.slice(0, 300)}`, fix: 'Check the run log; the best reviewed draft was kept.' };
    console.warn(`::warning::[review] ${step} failed in round ${round}; keeping the best reviewed draft: ${message.slice(0, 300)}`);
    rounds.push({ round, words: 0, issues: [issue], error: message });
    return finish([issue]);
  };

  for (let round = 1; ; round++) {
    const sections = assembleSections(config, draft, spoken);
    const rules = ruleIssues(config, sections, brief.targetWords, brief.segment, quotes);
    let checked: Issue[];
    try {
      checked = await factCheck(config, brief, sections);
    } catch (err) {
      if (!reviewed.length) throw err;
      return failed(round, 'fact-check', err);
    }
    const issues = [...rules, ...checked];
    rounds.push({ round, words: sectionWords(sections), issues });
    reviewed.push({ round, draft, sections, issues });
    console.log(`[review] round ${round}: ${sectionWords(sections)} words, ${issues.length} issues (${blocking(issues).length} critical)`);
    if (!needsRevision(issues) || round > config.quality.max_revisions) return finish();
    try {
      draft = await reviseDraft(config, brief, draft, sections, formatIssues(issues.filter((i) => i.severity !== 'minor')));
    } catch (err) {
      return failed(round + 1, 'revise', err);
    }
  }
}
