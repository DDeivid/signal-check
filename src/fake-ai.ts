/**
 * A deterministic stand-in for Gemini (SC_FAKE_AI=true), for rehearsals and tests: valid JSON for every
 * text stage built from the real prompt (candidate ids, word budgets), and TTS tones as long as the words.
 * SC_FAKE_SILENT_CHUNK=n makes TTS chunk n come back silent, to prove the audio checks stop the run.
 */
import { FinishReason, type GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { SAMPLE_RATE } from './wav';

const WORDS_PER_MINUTE = 150;
const LINE_WORDS = 40;
const CODES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike',
  'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray', 'yankee', 'zulu'];
const VOCAB = ['the', 'report', 'says', 'officials', 'expect', 'a', 'slower', 'rollout', 'while', 'critics', 'point', 'to', 'costs',
  'and', 'open', 'questions', 'about', 'who', 'pays', 'for', 'it', 'next', 'year', 'so', 'we', 'will', 'watch', 'how', 'that', 'plays', 'out'];
const SECTIONS = ['headlines', 'main_1', 'main_2', 'segment', 'quick_hits'] as const;

interface FakeOptions {
  silentChunk?: number;
}

const promptOf = (p: GenerateContentParameters) => (typeof p.contents === 'string' ? p.contents : JSON.stringify(p.contents));

function textResponse(text: string): GenerateContentResponse {
  const response = new GenerateContentResponse();
  response.candidates = [{ content: { role: 'model', parts: [{ text }] }, finishReason: FinishReason.STOP }];
  return response;
}

/** Candidate ids from the selection prompt, split into core and outside topics. */
function candidates(prompt: string): { core: string[]; outside: string[] } {
  const list = prompt.split('\nCandidates:\n')[1] ?? '';
  const core: string[] = [];
  const outside: string[] = [];
  for (const m of list.matchAll(/^(s\d+) \[([^\]]+)\]/gm)) (m[2]!.startsWith('OUTSIDE:') ? outside : core).push(m[1]!);
  return { core, outside };
}

/** A pick that satisfies validateSelection and the outside-topic share, from whatever candidates exist. */
export function fakeSelection(prompt: string) {
  const { core, outside } = candidates(prompt);
  const all = [...core, ...outside];
  if (all.length < 6) throw new Error('fake select: too few candidates');
  const c = (i: number) => core[i] ?? all[i % all.length]!;
  const o = (i: number) => outside[i] ?? c(i + 6);
  const main = [c(0), c(1)];
  return {
    headlines: [c(0), c(1), c(2), o(0), c(3)],
    main: main.map((id) => ({ id, angle: 'What changed and why it matters.', follow_up_of: null })),
    quick_hits: [c(4), o(1), c(5), o(2)].filter((id) => !main.includes(id)),
    segment_items: [o(3)],
    notes: 'Fake selection for a rehearsal.',
  };
}

function fakeLine(n: number, count: number): string {
  const code = `${CODES[n % CODES.length]} ${CODES[Math.floor(n / CODES.length) % CODES.length]}`;
  const rest = Array.from({ length: Math.max(count - 2, 1) }, (_, j) => VOCAB[(n * 7 + j * 3) % VOCAB.length]);
  return `${code[0]!.toUpperCase()}${code.slice(1)} ${rest.join(' ')}.`;
}

/** A draft with each section at its word budget, alternating hosts, no digits and no repeated lines. */
export function fakeDraft(prompt: string) {
  const [a = 'Mia', b = 'Theo'] = /exactly "([^"]+)" or "([^"]+)"/.exec(prompt)?.slice(1) ?? [];
  const ids = [...new Set([...prompt.matchAll(/^\[(s\d+)\]/gm)].map((m) => m[1]!))];
  let n = 0;
  const sections = SECTIONS.map((id) => {
    const budget = Number(new RegExp(`${id} \\(~(\\d+)\\)`).exec(prompt)?.[1] ?? 100);
    const lines: Array<{ speaker: string; text: string }> = [];
    for (let left = budget; left > 0; left -= LINE_WORDS) {
      lines.push({ speaker: lines.length % 2 ? b : a, text: fakeLine(n++, Math.min(LINE_WORDS, Math.max(left, 6))) });
    }
    return { id, title: id.replace('_', ' '), lines };
  });
  return {
    title: 'Rehearsal episode',
    description: 'A rehearsal episode made by the fake AI client.',
    sections,
    predictions: [],
    open_threads: [],
    story_summaries: ids.map((id) => ({ id, summary: `Fake summary of ${id}.` })),
  };
}

/** Same-length tone with a slow swell, so it never reads as silence. */
export function tonePcm(seconds: number, silent = false): Buffer {
  const samples = Math.round(seconds * SAMPLE_RATE);
  const pcm = Buffer.alloc(samples * 2);
  if (silent) return pcm;
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const swell = 0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * 1.5 * t));
    pcm.writeInt16LE(Math.round(0.25 * swell * Math.sin(2 * Math.PI * 220 * t) * 32_767), i * 2);
  }
  return pcm;
}

/** Words spoken in a TTS request: the "Name: text" lines after the style paragraph. */
export function spokenWords(contents: string): number {
  const conversation = contents.split('\n\n').slice(1).join('\n\n');
  return conversation
    .split('\n')
    .map((l) => l.replace(/^[^:\n]{1,40}:\s*/, ''))
    .reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0);
}

function audioResponse(seconds: number, silent: boolean): GenerateContentResponse {
  const response = new GenerateContentResponse();
  const data = tonePcm(seconds, silent).toString('base64');
  response.candidates = [{ content: { role: 'model', parts: [{ inlineData: { mimeType: `audio/L16;codec=pcm;rate=${SAMPLE_RATE}`, data } }] }, finishReason: FinishReason.STOP }];
  return response;
}

export function fakeAiClient(options: FakeOptions = { silentChunk: Number(process.env.SC_FAKE_SILENT_CHUNK) || undefined }) {
  let factChecks = 0;
  return {
    async generateContent(label: string, params: GenerateContentParameters): Promise<GenerateContentResponse> {
      const prompt = promptOf(params);
      if (params.config?.responseModalities?.includes('AUDIO')) {
        const silent = options.silentChunk !== undefined && label === `tts:${options.silentChunk}`;
        return audioResponse((spokenWords(prompt) / WORDS_PER_MINUTE) * 60, silent);
      }
      const stage = label.split(':')[0];
      switch (stage) {
        case 'select':
          return textResponse(JSON.stringify(fakeSelection(prompt)));
        case 'research':
          return textResponse(`Fake research notes for ${label}. What happened, the background, and what is still unknown.`);
        case 'write':
          return textResponse(JSON.stringify(fakeDraft(`${prompt}\n${String(params.config?.systemInstruction ?? '')}`)));
        case 'revise': {
          const current = /CURRENT DRAFT\n(.*)\n/.exec(prompt)?.[1];
          return textResponse(current ?? JSON.stringify(fakeDraft(prompt)));
        }
        case 'fact-check': {
          // One major issue in the first round, so the revise path runs; clean after that.
          const issues = factChecks++ === 0 ? [{ line: 3, severity: 'major', problem: 'Fake: needs a caveat.', fix: 'Add the caveat.' }] : [];
          return textResponse(JSON.stringify({ issues }));
        }
        default:
          throw new Error(`fake AI: no answer for stage "${label}"`);
      }
    },
  };
}
