import type { GenerateContentResponse } from '@google/genai';
import { AudioQaError, checkChunk } from './audio-qa';
import type { Config } from './config';
import { ai, classify, describeError, sleep, TTS_TIMEOUT_MS, withModelsNamed, withTimeout } from './llm';
import { type Line, words } from './script';
import { pcmToWav } from './wav';

/** The TTS answered without usable audio (no audio part, or it stopped for a reason other than STOP). Worth retrying. */
export class TtsOutputError extends Error {
  override name = 'TtsOutputError';
  readonly action = 'retry';
}

/** One voiced chunk, as written to out/tts.json. */
export interface ChunkReport {
  index: number;
  words: number;
  chars: number;
  seconds: number;
  ratio: number;
  model: string;
  finishReason: string;
  /** Set on attempts that failed the audio checks. */
  problems?: string[];
}

export interface VoicedChunk {
  wav: Buffer;
  report: ChunkReport;
}

/** The audio part of a TTS response, or a TtsOutputError. A missing finishReason is accepted; only an explicit non-STOP fails. */
export function audioPart(response: GenerateContentResponse): { pcm: Buffer; mimeType: string | undefined; finishReason: string } {
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason ?? 'unknown';
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new TtsOutputError(`TTS stopped early (finish reason: ${finishReason})`);
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new TtsOutputError(`no audio in TTS response (finish reason: ${finishReason})`);
  return { pcm: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType, finishReason };
}

const lineWords = (lines: Line[]) => lines.reduce((n, l) => n + words(l.text), 0);

async function requestAudio(config: Config, model: string, lines: Line[], label: string): Promise<GenerateContentResponse> {
  const conversation = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
  return withTimeout(TTS_TIMEOUT_MS, (abortSignal) =>
    ai().generateContent(label, {
      model,
      contents: `${config.tts.style}\n\n${conversation}`,
      config: {
        abortSignal,
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: config.hosts.map((h) => ({
              speaker: h.name,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: h.voice } },
            })),
          },
        },
      },
    }),
  );
}

/**
 * Voice one chunk with one model and check the audio. `qaFailures` counts failed audio checks for this chunk
 * across calls: the first is retried, the second stops the run. `attempts` collects the failed checks for tts.json.
 */
export async function voiceChunk(
  config: Config,
  model: string,
  lines: Line[],
  index: number,
  label: string,
  state: { qaFailures: number; attempts: ChunkReport[] },
): Promise<VoicedChunk> {
  const { pcm, mimeType, finishReason } = audioPart(await requestAudio(config, model, lines, label));
  const count = lineWords(lines);
  const check = checkChunk(pcm, mimeType, count, config.episode.words_per_minute);
  const report: ChunkReport = {
    index,
    words: count,
    chars: lines.reduce((n, l) => n + l.text.length, 0),
    seconds: Math.round(check.seconds * 10) / 10,
    ratio: Math.round(check.ratio * 100) / 100,
    model,
    finishReason,
  };
  if (check.problems.length) {
    state.qaFailures++;
    state.attempts.push({ ...report, problems: check.problems });
    throw new AudioQaError(`[${label}] audio check failed: ${check.problems.join('; ')}`, state.qaFailures > 1);
  }
  return { wav: pcmToWav(pcm), report };
}

/** Voice a single chunk with the first model that works. Used by the voice test. */
export async function speakChunk(config: Config, lines: Line[], label: string): Promise<Buffer> {
  const state = { qaFailures: 0, attempts: [] };
  const { result } = await withModelsNamed(label, config.tts.models, (model) => voiceChunk(config, model, lines, 1, label, state));
  return result.wav;
}

/**
 * Voice `count` chunks with a single model. The first chunk may fall through the model list; after that the
 * model is fixed. If it fails on a later chunk, every chunk is voiced again with the next model, so one
 * episode never mixes voices from two models. Fatal errors (including a chunk failing its audio check twice) stop at once.
 */
export async function voiceWithOneModel<T>(
  models: string[],
  count: number,
  voice: (models: string[], n: number) => Promise<{ result: T; model: string }>,
): Promise<{ model: string; results: T[] }> {
  let remaining = models;
  for (;;) {
    let sticky: string | undefined;
    const results: T[] = [];
    try {
      for (let n = 0; n < count; n++) {
        const { result, model } = await voice(sticky ? [sticky] : remaining, n);
        sticky = model;
        results.push(result);
      }
      if (!sticky) throw new Error('nothing to voice');
      return { model: sticky, results };
    } catch (err) {
      if (!sticky || classify(err) === 'fatal') throw err;
      remaining = models.slice(models.indexOf(sticky) + 1);
      if (!remaining.length) throw err;
      console.warn(`[tts] ${sticky} failed partway (${describeError(err)}); re-voicing every chunk with ${remaining[0]}`);
    }
  }
}

/** Voice every chunk. `log` receives each accepted chunk and each failed audio check, for out/tts.json. */
export async function speakAll(config: Config, chunks: Line[][], log: ChunkReport[] = []): Promise<{ model: string; parts: Buffer[] }> {
  const states = chunks.map(() => ({ qaFailures: 0, attempts: [] as ChunkReport[] }));
  const accepted: ChunkReport[] = [];
  const sync = () => log.splice(0, log.length, ...[...states.flatMap((s) => s.attempts), ...accepted].sort((a, b) => a.index - b.index));
  try {
    const { model, results } = await voiceWithOneModel(config.tts.models, chunks.length, async (models, n) => {
      if (n === 0) accepted.length = 0;
      if (n > 0) await sleep(config.tts.seconds_between_requests * 1000);
      const chunk = chunks[n]!;
      console.log(`[tts] chunk ${n + 1}/${chunks.length} (${chunk.length} lines)`);
      const label = `tts:${n + 1}`;
      const voiced = await withModelsNamed(label, models, (model) => voiceChunk(config, model, chunk, n + 1, label, states[n]!));
      accepted.push(voiced.result.report);
      return voiced;
    });
    return { model, parts: results.map((r) => r.wav) };
  } finally {
    sync();
  }
}
