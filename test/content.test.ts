import { ApiError } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { fakeAiClient, fakeDraft, fakeSelection, spokenWords } from '../src/fake-ai';
import { fetchText, fixtureItems, prepareItems } from '../src/feeds';
import { type AiClient, modelUses, resetModelState, setAiClient } from '../src/llm';
import { emptyRun, summaryMarkdown } from '../src/run-summary';
import { type Draft, draftSchema, numberedScript } from '../src/script';
import { assembleSections, bestReviewed, contentLoop, type Issue, ruleIssues } from '../src/stages/review';
import { outsideShare, selectionPrompt, shortlist, validateSelection } from '../src/stages/select';
import { type Brief, revisePrompt, writerPrompt } from '../src/stages/write';
import fixture from './fixtures/feeds.json' with { type: 'json' };

const config = loadConfig();
const fast = { ...config, llm: { ...config.llm, min_seconds_between_calls: 0, fallback_model: '' } };
const spoken = { weekday: 'Friday', date: 'October 16' };
const now = new Date('2026-10-16T05:00:00Z');
const items = prepareItems(fixtureItems(fixture, now).raw, new Date(now.getTime() - 30 * 3_600_000), now, new Set());
const brief: Brief = { weekday: 'Friday', date: 'October 16', segment: 'prediction_check', targetWords: 1800, materials: items.map((i) => `[${i.id}] ${i.title}`).join('\n'), producerNotes: '' };

/** A draft from the fake writer for this brief: right length, no repeats. */
const goodDraft = () => draftSchema.parse(fakeDraft(writerPrompt(config, brief)));

beforeEach(() => resetModelState());
afterEach(() => setAiClient(undefined));

describe('draft schema', () => {
  const base = { title: 'T', description: 'D', sections: [{ id: 'headlines', title: 'H', lines: [{ speaker: 'Mia', text: 'Hi.' }] }] };

  it('rejects duplicate section ids', () => {
    const twice = { ...base, sections: [...base.sections, ...base.sections] };
    expect(draftSchema.safeParse(twice).error?.issues[0]?.message).toBe('each section id may appear only once');
  });

  it('rejects whitespace-only lines and trims the rest', () => {
    expect(draftSchema.safeParse({ ...base, sections: [{ ...base.sections[0], lines: [{ speaker: 'Mia', text: '  \n ' }] }] }).success).toBe(false);
    expect(draftSchema.parse({ ...base, sections: [{ ...base.sections[0], lines: [{ speaker: 'Mia', text: ' Hi. ' }] }] }).sections[0]!.lines[0]!.text).toBe('Hi.');
  });
});

describe('script rules', () => {
  const issuesFor = (draft: Draft, targetWords = brief.targetWords) => ruleIssues(config, assembleSections(config, draft, spoken), targetWords, 'deep_dive', []);

  it('finds nothing wrong with a clean draft', () => {
    expect(issuesFor(goodDraft())).toEqual([]);
  });

  it('flags repeated and near-repeated lines as critical', () => {
    const draft = goodDraft();
    const lines = draft.sections[1]!.lines;
    lines.push({ speaker: 'Theo', text: lines[0]!.text.toUpperCase().replace('.', '!') });
    const issues = issuesFor(draft).filter((i) => i.problem.startsWith('Line repeats'));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('critical');
  });

  it('flags a script under half the target as critical, and a mildly short one as major', () => {
    expect(issuesFor(goodDraft(), 5000).find((i) => i.problem.includes('target is 5000'))?.severity).toBe('critical');
    expect(issuesFor(goodDraft(), 2600).find((i) => i.problem.includes('target is 2600'))?.severity).toBe('major');
  });

  it('flags a missing section as critical', () => {
    const draft = goodDraft();
    draft.sections = draft.sections.filter((s) => s.id !== 'main_2');
    expect(issuesFor(draft).find((i) => i.problem.includes('main_2'))?.severity).toBe('critical');
  });
});

describe('best draft', () => {
  const issue = (severity: Issue['severity']): Issue => ({ source: 'rules', severity, problem: 'p', fix: 'f' });

  it('prefers fewer critical issues, then fewer major ones, then the latest', () => {
    const rounds = [
      { round: 1, issues: [issue('major'), issue('major')] },
      { round: 2, issues: [issue('critical')] },
      { round: 3, issues: [issue('major'), issue('minor')] },
      { round: 4, issues: [issue('major'), issue('major')] },
    ];
    expect(bestReviewed(rounds).round).toBe(3);
    expect(bestReviewed([rounds[0]!, rounds[3]!]).round).toBe(4);
    expect(bestReviewed([rounds[1]!]).round).toBe(2);
  });
});

describe('content loop', () => {
  /** The fake client, with some stages replaced. */
  function client(overrides: Record<string, (prompt: string) => string | Error>): AiClient {
    const fake = fakeAiClient({});
    return {
      async generateContent(label, params) {
        const override = overrides[label];
        if (!override) return fake.generateContent(label, params);
        const out = override(String(params.contents));
        if (out instanceof Error) throw out;
        return fake.generateContent('fact-check', params).then((r) => {
          r.candidates![0]!.content!.parts = [{ text: out }];
          return r;
        });
      },
    };
  }

  it('revises once and keeps the clean draft', async () => {
    setAiClient(fakeAiClient({}));
    const result = await contentLoop(fast, brief, goodDraft(), spoken, []);
    expect(result.rounds.map((r) => r.issues.length)).toEqual([1, 0]);
    expect(result.chosenRound).toBe(2);
    expect(result.unresolved).toEqual([]);
    expect(modelUses().map((u) => u.label)).toEqual(['fact-check', 'revise', 'fact-check']);
  });

  it('keeps an earlier draft when revisions make it worse', async () => {
    const worse = (prompt: string) => {
      const draft = JSON.parse(/CURRENT DRAFT\n(.*)\n/.exec(prompt)![1]!) as Draft;
      draft.sections[0]!.lines.push(draft.sections[0]!.lines[0]!);
      return JSON.stringify(draft);
    };
    const alwaysMajor = () => JSON.stringify({ issues: [{ line: 2, severity: 'major', problem: 'Needs a source.', fix: 'Attribute it.' }] });
    setAiClient(client({ revise: worse, 'fact-check': alwaysMajor }));
    const first = goodDraft();
    const result = await contentLoop(fast, brief, first, spoken, []);
    expect(result.rounds).toHaveLength(config.quality.max_revisions + 1);
    expect(result.chosenRound).toBe(1);
    expect(result.draft).toEqual(first);
    expect(result.unresolved.some((i) => i.severity === 'critical')).toBe(false);
  });

  it('keeps the best draft and records a major issue when revise fails after a full round', async () => {
    setAiClient(client({ revise: () => new ApiError({ status: 400, message: 'Invalid argument' }) }));
    const first = goodDraft();
    const result = await contentLoop(fast, brief, first, spoken, []);
    expect(result.draft).toEqual(first);
    expect(result.chosenRound).toBe(1);
    const failure = result.unresolved.find((i) => i.source === 'pipeline');
    expect(failure).toMatchObject({ severity: 'major' });
    expect(failure!.problem).toContain('revise call failed in round 2');
    expect(result.rounds.at(-1)!.error).toContain('Invalid argument');
  });

  it('keeps the best draft when the second fact-check fails', async () => {
    let checks = 0;
    const secondFails = () => (++checks === 2 ? new ApiError({ status: 400, message: 'Bad request' }) : JSON.stringify({ issues: [{ line: 3, severity: 'major', problem: 'x', fix: 'y' }] }));
    setAiClient(client({ 'fact-check': secondFails }));
    const result = await contentLoop(fast, brief, goodDraft(), spoken, []);
    expect(result.chosenRound).toBe(1);
    expect(result.unresolved.map((i) => i.source)).toEqual(['fact-check', 'pipeline']);
  });

  it('fails the run when the first fact-check fails', async () => {
    setAiClient(client({ 'fact-check': () => new ApiError({ status: 400, message: 'Bad request' }) }));
    await expect(contentLoop(fast, brief, goodDraft(), spoken, [])).rejects.toThrow('Bad request');
  });
});

describe('reviser prompt', () => {
  it('includes the numbered script and says to replace lines', () => {
    const draft = goodDraft();
    const sections = assembleSections(config, draft, spoken);
    const prompt = revisePrompt(config, brief, draft, sections, '- [major] line 4: x');
    expect(prompt).toContain(numberedScript(sections));
    expect(prompt).toContain('line numbers in the issues refer to this numbering');
    expect(prompt).toContain('replacing that line');
    expect(prompt.indexOf('NUMBERED SCRIPT')).toBeGreaterThan(prompt.indexOf('CURRENT DRAFT'));
  });
});

describe('fake AI client', () => {
  it('picks a valid selection from the real candidate ids', () => {
    const candidates = shortlist(items);
    const selection = fakeSelection(selectionPrompt(config, 'far_field', candidates, [], ''));
    expect(validateSelection(config, { ...selection, notes: '' }, candidates)).toEqual([]);
    expect(outsideShare(config, { ...selection, notes: '' }, candidates)).toBeGreaterThanOrEqual(1 - config.topics.core_share - 0.1);
  });

  it('writes to the word budget', () => {
    const draft = goodDraft();
    const total = draft.sections.flatMap((s) => s.lines).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    expect(Math.abs(total - brief.targetWords)).toBeLessThan(brief.targetWords * 0.05);
    expect(draft.story_summaries.length).toBe(items.length);
  });

  it('counts the spoken words of a TTS request', () => {
    expect(spokenWords('Read this calmly.\n\nMia: Good morning all.\nTheo: Hi.')).toBe(4);
  });
});

describe('fixture feeds', () => {
  it('builds items relative to now, one result per feed', () => {
    const { raw, results } = fixtureItems([{ feed: 'F', topic: 'world', title: 'T', url: 'https://x/1', hoursAgo: 2 }], now);
    expect(raw[0]!.published.toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(results).toEqual([{ name: 'F', url: 'fixture', ok: true, items: 1 }]);
  });

  it('has enough items, inside and outside the core topics', () => {
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(items.some((i) => !config.topics.core.some((t) => t.id === i.topic))).toBe(true);
  });

  it('blocks network fetches in fixture mode', async () => {
    process.env.SC_FIXTURE_FEEDS = 'test/fixtures/feeds.json';
    try {
      await expect(fetchText('https://example.com/')).rejects.toThrow('no network in fixture mode');
    } finally {
      delete process.env.SC_FIXTURE_FEEDS;
    }
  });
});

describe('run summary', () => {
  it('covers the run, and the failure when there is one', () => {
    const run = {
      ...emptyRun(),
      date: '2026-10-16',
      weekday: 'friday',
      segment: 'prediction_check',
      minutes: 12,
      targetWords: 1800,
      window: { from: '2026-10-15T05:00:00Z', to: '2026-10-16T05:00:00Z', items: 21 },
      failedFeeds: ['Polygon (HTTP 503)'],
      stories: [{ role: 'main 1', id: 's1', title: 'Ceasefire | talks' }],
      rounds: [{ round: 1, words: 1790, issues: [{ source: 'rules' as const, severity: 'major' as const, problem: 'Too long.', fix: 'Cut.' }] }],
      chosenRound: 1,
      tts: [{ index: 1, words: 400, chars: 2200, seconds: 158.1, ratio: 0.99, model: 'tts-a', finishReason: 'STOP' }],
      ttsModel: 'tts-a',
      failure: { stage: 'assemble', message: 'spawnSync ffmpeg ENOENT' },
    };
    const md = summaryMarkdown(run, [
      { label: 'select', model: 'gemini-flash-latest', fallbacks: [] },
      { label: 'research:s1', model: 'gemini-3.7-flash', fallbacks: ['gemini-flash-latest (429 quota)'] },
    ]);
    expect(md).toContain('# Signal Check run: FAILED in assemble');
    expect(md).toContain('- Target: 12 min (1800 words)');
    expect(md).toContain('21 items');
    expect(md).toContain('Polygon (HTTP 503)');
    expect(md).toContain('main 1: Ceasefire | talks');
    expect(md).toContain('| research | 1 | gemini-3.7-flash |');
    expect(md).toContain('research:s1: gemini-flash-latest (429 quota) → gemini-3.7-flash');
    expect(md).toContain('### Round 1 (1790 words), kept');
    expect(md).toContain('| 1 | 400 | 2200 | 158.1 | 0.99 | tts-a | STOP | ok |');
    expect(md).toContain('spawnSync ffmpeg ENOENT');
  });
});
