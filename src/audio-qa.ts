/**
 * Checks on the audio itself, so a broken episode is caught before it's published:
 * per TTS chunk (length vs words, silence, format) and for the assembled MP3.
 */
import { SAMPLE_RATE } from './wav';

export const RATIO_MIN = 0.6;
export const RATIO_MAX = 1.6;
/** RMS below this counts as silence (same level validate-audio hands to ffmpeg's silencedetect). */
export const SILENCE_DBFS = -50;
export const MAX_SILENT_SHARE = 0.2;
export const RECONCILE_TOLERANCE_S = 3;
export const MIN_TARGET_SHARE = 0.6;

/** A TTS chunk (or the episode) that failed an audio check. */
export class AudioQaError extends Error {
  override name = 'AudioQaError';
  /** First failure of a chunk is retried; a repeat failure stops the run. */
  readonly action: 'retry' | 'fatal';
  constructor(message: string, final: boolean) {
    super(message);
    this.action = final ? 'fatal' : 'retry';
  }
}

export interface ChunkCheck {
  seconds: number;
  expectedSeconds: number;
  ratio: number;
  silentShare: number;
  problems: string[];
}

export const pcmSeconds = (pcm: Buffer, sampleRate = SAMPLE_RATE) => pcm.length / 2 / sampleRate;

export const expectedSeconds = (words: number, wordsPerMinute: number) => (words / wordsPerMinute) * 60;

const dbfs = (rms: number) => (rms > 0 ? 20 * Math.log10(rms / 32_768) : -Infinity);

function rms(pcm: Buffer, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const s = pcm.readInt16LE(i * 2);
    sum += s * s;
  }
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

/** RMS level in dBFS per window (the last window may be shorter, but at least half a window). */
export function windowLevels(pcm: Buffer, sampleRate = SAMPLE_RATE, windowSeconds = 1): number[] {
  const samples = Math.floor(pcm.length / 2);
  const size = Math.round(sampleRate * windowSeconds);
  const levels: number[] = [];
  for (let from = 0; from < samples; from += size) {
    const to = Math.min(from + size, samples);
    if (to - from < size / 2 && levels.length) break;
    levels.push(dbfs(rms(pcm, from, to)));
  }
  return levels;
}

/** Sample rate from a TTS mimeType like "audio/L16;codec=pcm;rate=24000". Problems if it isn't 16-bit PCM at 24 kHz. */
export function checkMimeType(mimeType: string | undefined): string[] {
  const mime = mimeType ?? '';
  const problems: string[] = [];
  if (!/^audio\/(L16|pcm)\b/i.test(mime)) problems.push(`unexpected audio format "${mime || 'none'}" (want audio/L16 or audio/pcm)`);
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? SAMPLE_RATE);
  if (rate !== SAMPLE_RATE) problems.push(`unexpected sample rate ${rate} Hz (want ${SAMPLE_RATE})`);
  return problems;
}

/** Everything we can tell from one chunk's PCM: is it about as long as its words, is there sound, is it the right format. */
export function checkChunk(pcm: Buffer, mimeType: string | undefined, words: number, wordsPerMinute: number): ChunkCheck {
  const problems = checkMimeType(mimeType);
  const seconds = pcmSeconds(pcm);
  const expected = expectedSeconds(words, wordsPerMinute);
  const ratio = expected > 0 ? seconds / expected : 0;
  if (pcm.length % 2) problems.push('PCM has an odd number of bytes');
  if (!(ratio >= RATIO_MIN && ratio <= RATIO_MAX)) {
    problems.push(`audio is ${seconds.toFixed(1)}s for ${words} words (expected ~${expected.toFixed(1)}s, ratio ${ratio.toFixed(2)}; allowed ${RATIO_MIN}-${RATIO_MAX})`);
  }
  const levels = windowLevels(pcm);
  const silent = levels.filter((l) => l < SILENCE_DBFS).length;
  const silentShare = levels.length ? silent / levels.length : 1;
  const overall = dbfs(rms(pcm, 0, Math.floor(pcm.length / 2)));
  if (overall < SILENCE_DBFS) problems.push(`audio is effectively silent (${Number.isFinite(overall) ? overall.toFixed(1) : '-inf'} dBFS)`);
  else if (silentShare > MAX_SILENT_SHARE) problems.push(`${Math.round(silentShare * 100)}% of the audio is silent (${silent} of ${levels.length} seconds)`);
  return { seconds, expectedSeconds: expected, ratio, silentShare, problems };
}

/** Duration of a PCM WAV file from its header (fmt byte rate and data chunk size). */
export function wavSeconds(wav: Buffer): number {
  if (wav.toString('latin1', 0, 4) !== 'RIFF' || wav.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let byteRate = 0;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString('latin1', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = wav.readUInt32LE(at + 16);
    if (id === 'data') {
      if (!byteRate) throw new Error('WAV data before fmt chunk');
      return Math.min(size, wav.length - at - 8) / byteRate;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

export interface Reconciliation {
  mp3Seconds: number;
  introSeconds: number;
  outroSeconds: number;
  chunkSeconds: number[];
  gapSeconds: number;
  targetMinutes: number;
}

/** Expected episode length: intro, gap, then each chunk followed by a gap, then outro (as assembleEpisode lays it out). */
export const expectedEpisodeSeconds = (r: Omit<Reconciliation, 'mp3Seconds' | 'targetMinutes'>) =>
  r.introSeconds + r.outroSeconds + r.chunkSeconds.reduce((a, b) => a + b, 0) + r.gapSeconds * (r.chunkSeconds.length + 1);

export const META_TOLERANCE_S = 2;
export const MIN_BYTES_SHARE = 0.7;
export const MAX_SILENCE_SHARE = 0.15;

export interface PublishedAudio {
  /** ffprobe duration of the MP3, seconds. */
  duration: number;
  /** durationSeconds in meta.json. */
  metaDuration: number;
  targetMinutes: number;
  bytes: number;
  bitrateBps: number;
  /** Total silence from silencedetect, seconds. */
  silence: number;
}

/** The independent check validate-audio runs on the finished MP3 before release. */
export function publishedAudioProblems(a: PublishedAudio): string[] {
  if (!Number.isFinite(a.duration) || a.duration <= 0) return [`MP3 duration is not a usable number (${a.duration})`];
  const problems: string[] = [];
  if (!Number.isFinite(a.metaDuration) || Math.abs(a.duration - a.metaDuration) > META_TOLERANCE_S) {
    problems.push(`MP3 is ${a.duration.toFixed(1)}s but meta.json says ${a.metaDuration}s (allowed ±${META_TOLERANCE_S}s)`);
  }
  const minimum = MIN_TARGET_SHARE * a.targetMinutes * 60;
  if (!(a.duration >= minimum)) problems.push(`MP3 is ${a.duration.toFixed(1)}s, under ${MIN_TARGET_SHARE} × the ${a.targetMinutes}-minute target (${minimum}s)`);
  const minBytes = Math.round(a.duration * (a.bitrateBps / 8) * MIN_BYTES_SHARE);
  if (a.bytes < minBytes) problems.push(`MP3 is ${a.bytes} bytes; at least ${minBytes} expected for ${a.duration.toFixed(0)}s at ${a.bitrateBps / 1000} kbps`);
  const share = a.silence / a.duration;
  if (share > MAX_SILENCE_SHARE) problems.push(`${Math.round(share * 100)}% of the MP3 is silence (${a.silence.toFixed(1)}s; allowed ${MAX_SILENCE_SHARE * 100}%)`);
  return problems;
}

/** Problems with the assembled MP3's length, compared with its parts and with the target. */
export function reconcile(r: Reconciliation): string[] {
  if (!Number.isFinite(r.mp3Seconds)) return [`MP3 duration is not a number (${r.mp3Seconds})`];
  const problems: string[] = [];
  const expected = expectedEpisodeSeconds(r);
  if (Math.abs(r.mp3Seconds - expected) > RECONCILE_TOLERANCE_S) {
    problems.push(`MP3 is ${r.mp3Seconds.toFixed(1)}s but its parts add up to ${expected.toFixed(1)}s (allowed ±${RECONCILE_TOLERANCE_S}s); assembly dropped or added audio`);
  }
  const minimum = MIN_TARGET_SHARE * r.targetMinutes * 60;
  if (r.mp3Seconds < minimum) {
    problems.push(`MP3 is ${r.mp3Seconds.toFixed(1)}s, under ${MIN_TARGET_SHARE} × the ${r.targetMinutes}-minute target (${minimum}s)`);
  }
  return problems;
}
