import { ApiError, FinishReason, GenerateContentResponse } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioQaError } from '../src/audio-qa';
import { loadConfig } from '../src/config';
import { fakeAiClient } from '../src/fake-ai';
import { type AiClient, classify, resetModelState, setAiClient } from '../src/llm';
import type { Line } from '../src/script';
import { audioPart, type ChunkReport, speakAll, TtsOutputError, voiceWithOneModel } from '../src/tts';

const config = loadConfig();
const fast = { ...config, tts: { ...config.tts, seconds_between_requests: 0, models: ['tts-a', 'tts-b'] } };
const notFound = () => new ApiError({ status: 404, message: 'model is not found' });

const chunk = (n: number): Line[] =>
  Array.from({ length: 4 }, (_, i) => ({ speaker: i % 2 ? 'Theo' : 'Mia', text: `Chunk ${n} line ${i} ${'and then some more words here '.repeat(4)}` }));
const chunks = [chunk(1), chunk(2), chunk(3)];

function audioResponse(parts: GenerateContentResponse['candidates']): GenerateContentResponse {
  const r = new GenerateContentResponse();
  r.candidates = parts;
  return r;
}

beforeEach(() => resetModelState());
afterEach(() => {
  setAiClient(undefined);
  vi.useRealTimers();
});

describe('TTS response', () => {
  it('rejects a response without audio, or one that stopped early, as retryable', () => {
    const noAudio = audioResponse([{ content: { parts: [{ text: 'sorry' }] }, finishReason: FinishReason.STOP }]);
    expect(() => audioPart(noAudio)).toThrow(TtsOutputError);
    const cut = audioResponse([{ content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/L16;rate=24000' } }] }, finishReason: FinishReason.MAX_TOKENS }]);
    expect(() => audioPart(cut)).toThrow('MAX_TOKENS');
    expect(classify(new TtsOutputError('x'))).toBe('retry');
  });

  it('returns the PCM and its format', () => {
    const ok = audioResponse([{ content: { parts: [{ inlineData: { data: Buffer.alloc(8).toString('base64'), mimeType: 'audio/L16;rate=24000' } }] }, finishReason: FinishReason.STOP }]);
    expect(audioPart(ok)).toMatchObject({ mimeType: 'audio/L16;rate=24000', finishReason: 'STOP' });
    expect(audioPart(ok).pcm).toHaveLength(8);
  });
});

describe('one TTS model per episode', () => {
  /** A voice function where `fails(model, n)` decides which calls fail; records every call. */
  function voice(fails: (model: string, n: number) => boolean) {
    const calls: string[] = [];
    const fn = async (models: string[], n: number) => {
      for (const model of models) {
        calls.push(`${model}:${n}`);
        if (!fails(model, n)) return { result: `${model}:${n}`, model };
      }
      throw notFound();
    };
    return { calls, fn };
  }

  it('keeps the model of the first chunk for the rest', async () => {
    const { calls, fn } = voice((model, n) => model === 'a' && n === 0);
    const { model, results } = await voiceWithOneModel(['a', 'b', 'c'], 3, fn);
    expect(model).toBe('b');
    expect(results).toEqual(['b:0', 'b:1', 'b:2']);
    expect(calls).toEqual(['a:0', 'b:0', 'b:1', 'b:2']);
  });

  it('re-voices every chunk with the next model if the chosen one fails later', async () => {
    const { calls, fn } = voice((model, n) => model === 'a' && n === 2);
    const { model, results } = await voiceWithOneModel(['a', 'b'], 3, fn);
    expect(model).toBe('b');
    expect(results).toEqual(['b:0', 'b:1', 'b:2']);
    expect(calls).toEqual(['a:0', 'a:1', 'a:2', 'b:0', 'b:1', 'b:2']);
  });

  it('fails when no later model is left', async () => {
    const { fn } = voice((model, n) => model === 'b' || (model === 'a' && n === 1));
    await expect(voiceWithOneModel(['a', 'b'], 3, fn)).rejects.toThrow('not found');
  });

  it('never moves on after a fatal error', async () => {
    const calls: string[] = [];
    const fn = async (models: string[], n: number) => {
      calls.push(`${models[0]}:${n}`);
      if (n === 1) throw new AudioQaError('silent twice', true);
      return { result: n, model: models[0]! };
    };
    await expect(voiceWithOneModel(['a', 'b'], 3, fn)).rejects.toThrow('silent twice');
    expect(calls).toEqual(['a:0', 'a:1']);
  });
});

describe('speakAll with the fake client', () => {
  it('voices every chunk with one model and reports each', async () => {
    setAiClient(fakeAiClient({}));
    const log: ChunkReport[] = [];
    const { model, parts } = await speakAll(fast, chunks, log);
    expect(model).toBe('tts-a');
    expect(parts).toHaveLength(3);
    expect(log.map((r) => [r.index, r.model, r.finishReason])).toEqual([[1, 'tts-a', 'STOP'], [2, 'tts-a', 'STOP'], [3, 'tts-a', 'STOP']]);
    for (const r of log) expect(r.ratio).toBeCloseTo(1, 1);
    expect(log[0]!.words).toBeGreaterThan(40);
  });

  it('re-voices with the second model when the first stops answering partway', async () => {
    const fake = fakeAiClient({});
    const client: AiClient = {
      generateContent: (label, params) => (params.model === 'tts-a' && label === 'tts:3' ? Promise.reject(notFound()) : fake.generateContent(label, params)),
    };
    setAiClient(client);
    const log: ChunkReport[] = [];
    const { model } = await speakAll(fast, chunks, log);
    expect(model).toBe('tts-b');
    expect(new Set(log.map((r) => r.model))).toEqual(new Set(['tts-b']));
  });

  it('retries a silent chunk once, then stops the run', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fake = fakeAiClient({ silentChunk: 2 });
    setAiClient({ generateContent: (label, params) => (calls++, fake.generateContent(label, params)) });
    const log: ChunkReport[] = [];
    const done = speakAll(fast, chunks, log).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await done;
    expect(err).toBeInstanceOf(AudioQaError);
    expect(classify(err)).toBe('fatal');
    expect(calls).toBe(3); // chunk 1, chunk 2, chunk 2 again; never the second model
    expect(log.filter((r) => r.problems).map((r) => r.index)).toEqual([2, 2]);
    expect(log.find((r) => r.problems)!.problems!.join()).toContain('silent');
  });

  it('retries a chunk without audio, then falls back to the next model', async () => {
    vi.useFakeTimers();
    const fake = fakeAiClient({});
    setAiClient({
      generateContent: async (label, params) =>
        params.model === 'tts-a' ? audioResponse([{ content: { parts: [] }, finishReason: FinishReason.OTHER }]) : fake.generateContent(label, params),
    });
    const done = speakAll(fast, chunks);
    await vi.runAllTimersAsync();
    expect((await done).model).toBe('tts-b');
  });
});
