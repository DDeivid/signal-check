/**
 * Follow-ups on earlier episodes: Monday's still-developing threads and Friday's prediction check.
 * Without web search, the only evidence is the current news window, so every update cites item ids.
 */
import { z } from 'zod';
import type { Config } from '../config';
import type { FeedItem } from '../feeds';
import type { EpisodeRecord, PredictionGrade } from '../history';
import { generateJson } from '../llm';
import { citations, EVIDENCE_CAP, evidenceLines, FROM_ITEMS_ONLY, NO_UPDATE, type NewsResearch } from './research';
import { shortlist } from './select';

/** A too_early prediction is graded again on at most this many later Fridays. */
export const MAX_CARRIES = 2;

export interface PendingPrediction {
  text: string;
  by: string;
  episode: number;
  date: string;
  /** 1 for a new prediction, 2 or 3 for one carried from an earlier check. */
  attempt: number;
}

/** The evidence list: the selection's candidates (newest first, capped per topic), about 120 of them. */
export function evidenceItems(items: FeedItem[], cap = EVIDENCE_CAP): FeedItem[] {
  return shortlist(items).slice(0, cap);
}

/**
 * Predictions to grade today, each graded once: those made since (and including) the previous
 * prediction check episode, which makes its own predictions after grading, plus its too_early grades,
 * carried at most MAX_CARRIES times. With no earlier check, every episode's predictions.
 */
export function predictionsToGrade(history: EpisodeRecord[]): PendingPrediction[] {
  const last = history.findLastIndex((e) => e.segment === 'prediction_check');
  const dateOf = new Map(history.map((e) => [e.number, e.date]));
  const carried = last < 0 ? [] : (history[last]!.predictionGrades ?? [])
    .filter((g) => g.verdict === 'too_early' && (g.attempt ?? 1) <= MAX_CARRIES)
    .map((g) => ({ text: g.text, by: g.by, episode: g.episode, date: dateOf.get(g.episode) ?? '?', attempt: (g.attempt ?? 1) + 1 }));
  const fresh = history.slice(Math.max(last, 0)).flatMap((e) => e.predictions.map((p) => ({ ...p, episode: e.number, date: e.date, attempt: 1 })));
  return [...carried, ...fresh];
}

export const describePending = (p: PendingPrediction) =>
  `"${p.text}" (${p.by}, episode ${p.episode}, ${p.date})${p.attempt > 1 ? `, graded too early ${p.attempt - 1}x before` : ''}`;

const gradeSchema = z.object({
  grades: z.array(z.object({ n: z.number().int(), verdict: z.enum(['right', 'wrong', 'too_early']), evidence: z.string() })),
});

export function gradePrompt(today: string, pending: PendingPrediction[], research: NewsResearch, evidence: FeedItem[]): string {
  return `Today is ${today}. Grade each prediction from earlier episodes of a news podcast.

PREDICTIONS
${pending.map((p, n) => `${n + 1}. ${describePending(p)}`).join('\n')}

RESEARCH NOTES
${research.notes}

NEWS ITEMS
${evidenceLines(evidence)}

For each prediction give n (its number), a verdict and one sentence of evidence:
- right: a news item${research.itemsOnly ? '' : ' or a named source'} shows it happened.
- wrong: one shows it didn't, or can no longer happen.
- too_early: nothing settles it yet.
${research.itemsOnly ? `The news items are the only evidence. A right or wrong verdict must cite item ids in square brackets, e.g. [s12]; with no item to cite, the verdict is too_early and the evidence is "${NO_UPDATE}".` : 'Cite item ids in square brackets where they apply.'}

Return JSON: {"grades": [{"n": 1, "verdict": "too_early", "evidence": "${NO_UPDATE}"}]}`;
}

/**
 * Turns the model's answer into grades for exactly the pending predictions. Without web search a right or
 * wrong verdict that cites no listed item is downgraded to too_early; a prediction the model skipped is too_early.
 */
export function toGrades(answer: z.infer<typeof gradeSchema>, pending: PendingPrediction[], itemsOnly: boolean, evidence: FeedItem[]): PredictionGrade[] {
  return pending.map((p, n) => {
    const base = { text: p.text, by: p.by, episode: p.episode, attempt: p.attempt };
    const graded = answer.grades.find((g) => g.n === n + 1);
    if (!graded) return { ...base, verdict: 'too_early', evidence: NO_UPDATE };
    if (itemsOnly && graded.verdict !== 'too_early' && !citations(graded.evidence, evidence).known.length) {
      return { ...base, verdict: 'too_early', evidence: `${NO_UPDATE} (a "${graded.verdict}" verdict cited no news item)` };
    }
    return { ...base, verdict: graded.verdict, evidence: graded.evidence };
  });
}

export async function gradePredictions(config: Config, today: string, pending: PendingPrediction[], research: NewsResearch, evidence: FeedItem[]): Promise<PredictionGrade[]> {
  const system = 'You grade podcast predictions strictly against the evidence given. You return only JSON.';
  const answer = await generateJson(config, { label: 'grade', system, prompt: gradePrompt(today, pending, research, evidence), temperature: 0.1 }, gradeSchema);
  return toGrades(answer, pending, research.itemsOnly, evidence);
}

const VERDICT = { right: 'RIGHT', wrong: 'WRONG', too_early: 'TOO EARLY' } as const;

/** The grades as the writer sees them: decided before writing, with their evidence. */
export function gradesBlock(grades: PredictionGrade[], pending: PendingPrediction[]): string {
  return grades.map((g, n) => `- ${describePending(pending[n]!)}: ${VERDICT[g.verdict]}. Evidence: ${g.evidence}`).join('\n');
}

/** Materials text for research derived from the listed items, with the items it cites. */
export function newsResearchBlock(heading: string, research: NewsResearch, byId: Map<string, FeedItem>, itemBlock: (item: FeedItem) => string): string {
  const cited = research.cited.flatMap((id) => (byId.has(id) ? [itemBlock(byId.get(id)!)] : []));
  const mark = research.itemsOnly ? ' (derived only from the news items listed below, not from web search)' : ' (web search plus the news items listed below)';
  const notes = research.notes.startsWith(FROM_ITEMS_ONLY) ? research.notes.slice(FROM_ITEMS_ONLY.length).trim() : research.notes;
  return `${heading}${mark}:\n${notes}\n\nItems these notes cite:\n${cited.join('\n\n') || `(none: ${NO_UPDATE})`}`;
}
