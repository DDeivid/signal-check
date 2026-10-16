import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { fakeAiClient } from '../src/fake-ai';
import { type FeedItem, fixtureItems, prepareItems } from '../src/feeds';
import type { EpisodeRecord, PredictionGrade } from '../src/history';
import { type AiClient, resetModelState, setAiClient } from '../src/llm';
import { evidenceItems, gradePredictions, newsResearchBlock, predictionsToGrade, toGrades } from '../src/stages/followups';
import { citations, FROM_ITEMS_ONLY, NO_UPDATE, researchFromNews } from '../src/stages/research';
import fixture from './fixtures/feeds.json' with { type: 'json' };

const config = loadConfig();
const fast = { ...config, llm: { ...config.llm, min_seconds_between_calls: 0, fallback_model: '' } };
const now = new Date('2026-10-16T05:00:00Z');
const items = prepareItems(fixtureItems(fixture, now).raw, new Date(now.getTime() - 30 * 3_600_000), now, new Set());

beforeEach(() => resetModelState());
afterEach(() => setAiClient(undefined));

function episode(number: number, segment: string, predictions: string[], predictionGrades?: PredictionGrade[]): EpisodeRecord {
  return {
    number, date: `2026-10-${String(number).padStart(2, '0')}`, publishedAt: `2026-10-${String(number).padStart(2, '0')}T05:00:00Z`, weekday: 'x', segment,
    title: `E${number}`, description: '', audioUrl: '', audioBytes: 0, durationSeconds: 0, stories: [],
    predictions: predictions.map((text) => ({ text, by: 'Theo' })), openThreads: [], transcriptFile: '', notesFile: '',
    ...(predictionGrades ? { predictionGrades } : {}),
  };
}
const grade = (text: string, verdict: PredictionGrade['verdict'], attempt?: number): PredictionGrade => ({ text, by: 'Theo', episode: 1, verdict, evidence: 'e', ...(attempt ? { attempt } : {}) });

/** Records every prompt, answers with the fake client. */
function recording(prompts: Array<{ label: string; prompt: string; grounding: boolean }>): AiClient {
  const fake = fakeAiClient({});
  return {
    async generateContent(label, params) {
      prompts.push({ label, prompt: String(params.contents), grounding: JSON.stringify(params.config?.tools ?? []).includes('googleSearch') });
      return fake.generateContent(label, params);
    },
  };
}

describe('predictions to grade', () => {
  it('takes every prediction when there was no earlier check', () => {
    expect(predictionsToGrade([episode(1, 'look_back', ['A']), episode(2, 'deep_dive', ['B'])]).map((p) => [p.text, p.attempt])).toEqual([['A', 1], ['B', 1]]);
  });

  it('starts at the previous check: its own predictions, later ones, and its too_early grades carried', () => {
    const history = [
      episode(1, 'look_back', ['A', 'C']),
      episode(2, 'deep_dive', ['old']),
      episode(5, 'prediction_check', ['F'], [grade('A', 'too_early'), grade('C', 'right'), grade('old', 'wrong')]),
      episode(8, 'look_back', ['M']),
    ];
    const pending = predictionsToGrade(history);
    expect(pending.map((p) => [p.text, p.episode, p.attempt])).toEqual([['A', 1, 2], ['F', 5, 1], ['M', 8, 1]]);
    expect(pending[0]!.date).toBe('2026-10-01');
  });

  it('carries a too_early prediction at most twice', () => {
    const second = predictionsToGrade([episode(1, 'x', []), episode(5, 'prediction_check', [], [grade('A', 'too_early', 2)])]);
    expect(second.map((p) => p.attempt)).toEqual([3]);
    expect(predictionsToGrade([episode(1, 'x', []), episode(5, 'prediction_check', [], [grade('A', 'too_early', 3)])])).toEqual([]);
  });
});

describe('grades', () => {
  const pending = [1, 2, 3, 4].map((n) => ({ text: `P${n}`, by: 'Mia', episode: n, date: 'd', attempt: 1 }));
  const answer = {
    grades: [
      { n: 1, verdict: 'right' as const, evidence: 'It passed [s1].' },
      { n: 2, verdict: 'wrong' as const, evidence: 'It did not pass.' },
      { n: 3, verdict: 'right' as const, evidence: 'See [s999].' },
    ],
  };

  it('needs a cited news item for right or wrong without web search; skipped ones are too early', () => {
    expect(toGrades(answer, pending, true, items).map((g) => [g.text, g.verdict])).toEqual([['P1', 'right'], ['P2', 'too_early'], ['P3', 'too_early'], ['P4', 'too_early']]);
    expect(toGrades(answer, pending, true, items)[1]!.evidence).toContain(NO_UPDATE);
  });

  it('keeps the verdicts as given with web search', () => {
    expect(toGrades(answer, pending, false, items).map((g) => g.verdict)).toEqual(['right', 'wrong', 'right', 'too_early']);
  });

  it('records text, author, episode and attempt from the pending list, not from the model', () => {
    expect(toGrades(answer, pending, true, items)[0]).toEqual({ text: 'P1', by: 'Mia', episode: 1, attempt: 1, verdict: 'right', evidence: 'It passed [s1].' });
  });
});

describe('research from the news window', () => {
  it('caps the evidence list at 120 items', () => {
    const many: FeedItem[] = Array.from({ length: 300 }, (_, n) => ({ ...items[0]!, id: `s${n + 1}`, topic: `t${n % 10}` }));
    expect(evidenceItems(many)).toHaveLength(120);
  });

  it('finds cited ids and the ones that are not in the list', () => {
    expect(citations('Moved [s2], also [s2] and [s404].', items)).toEqual({ known: ['s2'], unknown: ['s404'] });
  });

  it('without web search: the items are the only evidence, and the notes say so', async () => {
    const prompts: Array<{ label: string; prompt: string; grounding: boolean }> = [];
    setAiClient(recording(prompts));
    const r = await researchFromNews(fast, 'research:threads', 'What happened to the talks?', items);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.grounding).toBe(false);
    expect(prompts[0]!.prompt).toContain(`[${items[0]!.id}] ${items[0]!.title} (${items[0]!.feed}, 2026-10-16)`);
    expect(prompts[0]!.prompt).toContain('These items are your only evidence');
    expect(prompts[0]!.prompt).toContain(`"${NO_UPDATE}"`);
    expect(r.itemsOnly).toBe(true);
    expect(r.notes.startsWith(FROM_ITEMS_ONLY)).toBe(true);
    expect(r.cited).toEqual([items[0]!.id]);
    const block = newsResearchBlock('Still developing', r, new Map(items.map((i) => [i.id, i])), (i) => `[${i.id}] ${i.title}`);
    expect(block).toContain('(derived only from the news items listed below, not from web search)');
    expect(block).toContain(`[${items[0]!.id}] ${items[0]!.title}`);
  });

  it('with web search: searches, and still sends the items', async () => {
    const prompts: Array<{ label: string; prompt: string; grounding: boolean }> = [];
    setAiClient(recording(prompts));
    const grounded = { ...fast, research: { ...fast.research, grounding: true } };
    const r = await researchFromNews(grounded, 'research:predictions', 'Did it pass?', items);
    expect(prompts[0]!.grounding).toBe(true);
    expect(prompts[0]!.prompt).toContain(`[${items[0]!.id}]`);
    expect(r.itemsOnly).toBe(false);
    expect(r.notes.startsWith(FROM_ITEMS_ONLY)).toBe(false);
  });

  it('grades with the fake client: too early without evidence', async () => {
    setAiClient(fakeAiClient({}));
    const pending = predictionsToGrade([episode(1, 'look_back', ['The vote passes', 'Prices fall'])]);
    const r = await researchFromNews(fast, 'research:predictions', 'Grade these.', items);
    const grades = await gradePredictions(fast, '2026-10-16', pending, r, items);
    expect(grades.map((g) => [g.text, g.verdict, g.episode])).toEqual([['The vote passes', 'too_early', 1], ['Prices fall', 'too_early', 1]]);
  });
});
