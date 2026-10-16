import { ApiError, type GenerateContentResponse, type GenerateContentParameters } from '@google/genai';
import { AudioQaError, checkChunk } from './audio-qa';
import type { Config } from './config';
import { ai, classify, describeError, sleep, TTS_TIMEOUT_MS, withModelsNamed, withTimeout } from './llm';
import { type Line, words } from './script';
import { decodeWav, pcmToWav, SAMPLE_RATE, toPcm16 } from './wav';

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
export function audioPart(response: GenerateContentResponse): { pcm: Buffer; mimeType: string | undefined; finishReason: string; source?: string } {
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason ?? 'unknown';
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new TtsOutputError(`TTS stopped early (finish reason: ${finishReason})`);
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new TtsOutputError(`no audio in TTS response (finish reason: ${finishReason})`);
  const bytes = Buffer.from(part.inlineData.data, 'base64');
  const mimeType = part.inlineData.mimeType;
  // Newer TTS models send a WAV file instead of raw PCM: unpack it to the 24 kHz mono PCM everything else uses.
  if (/^audio\/(x-)?wav\b/i.test(mimeType ?? '') || bytes.toString('latin1', 0, 4) === 'RIFF') {
    const wav = decodeWav(bytes);
    const source = `audio/wav ${wav.sampleRate} Hz, ${wav.channels} ch, ${wav.bits}-bit`;
    return { pcm: toPcm16(wav.samples, wav.sampleRate), mimeType: `audio/L16;codec=pcm;rate=${SAMPLE_RATE}`, finishReason, source };
  }
  return { pcm: bytes, mimeType, finishReason };
}

const lineWords = (lines: Line[]) => lines.reduce((n, l) => n + words(l.text), 0);

/**
 * Newer Gemini TTS models (3.8) reject the "Name: text" prompt and want one part per line, tagged with its
 * speaker. Which format a model wants is learned from that 400 the first time, then remembered for the run.
 */
const speakerPartModels = new Set<string>();

export const wantsSpeakerParts = (err: unknown) => err instanceof ApiError && err.status === 400 && /speech_metadata/i.test(err.message);

/** For tests: forget which models want speaker parts. */
export const resetTtsFormats = () => speakerPartModels.clear();

/** The style sent with one line: the show's style, the host's default delivery, and the line's own cue. */
export function lineStyle(config: Config, line: Line): string {
  const host = config.hosts.find((h) => h.name === line.speaker)?.delivery;
  const parts = [config.tts.style, host && `${line.speaker} sounds ${host}`, line.delivery && `This line: ${line.delivery}`];
  return parts.flatMap((p) => (p ? [`${p.trim().replace(/[.\s]+$/, '')}.`] : [])).join(' ');
}

/**
 * Speaker-parts models (3.8) get per-line direction. The "Name: text" prompt (3.1) gets each host's default
 * delivery in the preamble only: inline cues could be read aloud, so per-line delivery is left out there.
 */
export function ttsContents(config: Config, lines: Line[], speakerParts: boolean): GenerateContentParameters['contents'] {
  if (!speakerParts) {
    const hosts = config.hosts.filter((h) => h.delivery).map((h) => `${h.name} sounds ${h.delivery}.`).join(' ');
    return `${config.tts.style.trim()}${hosts ? ` ${hosts}` : ''}\n\n${lines.map((l) => `${l.speaker}: ${l.text}`).join('\n')}`;
  }
  return [{ role: 'user', parts: lines.map((l) => ({ text: l.text, speechMetadata: { speaker: l.speaker, style: lineStyle(config, l) } })) }];
}

async function requestAudio(config: Config, model: string, lines: Line[], label: string): Promise<GenerateContentResponse> {
  try {
    return await requestAudioAs(config, model, lines, label, speakerPartModels.has(model));
  } catch (err) {
    if (speakerPartModels.has(model) || !wantsSpeakerParts(err)) throw err;
    speakerPartModels.add(model);
    console.log(`[${label}] ${model} wants one part per speaker line; switching format`);
    return requestAudioAs(config, model, lines, label, true);
  }
}

async function requestAudioAs(config: Config, model: string, lines: Line[], label: string, speakerParts: boolean): Promise<GenerateContentResponse> {
  return withTimeout(TTS_TIMEOUT_MS, (abortSignal) =>
    ai().generateContent(label, {
      model,
      contents: ttsContents(config, lines, speakerParts),
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
  const { pcm, mimeType, finishReason, source } = audioPart(await requestAudio(config, model, lines, label));
  if (source) console.log(`[${label}] ${model} sent ${source}; converted to ${SAMPLE_RATE} Hz mono PCM`);
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
