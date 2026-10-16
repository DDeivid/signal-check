import { describe, expect, it } from 'vitest';
import { audioFileName, bitrateBps, parseDuration, parseSilence } from '../src/audio';
import {
  AudioQaError,
  checkChunk,
  checkMimeType,
  expectedEpisodeSeconds,
  publishedAudioProblems,
  reconcile,
  wavSeconds,
  windowLevels,
} from '../src/audio-qa';
import { tonePcm } from '../src/fake-ai';
import { classify } from '../src/llm';
import { chimes, pcmToWav, SAMPLE_RATE, silence } from '../src/wav';

const MIME = 'audio/L16;codec=pcm;rate=24000';
const WPM = 150;
/** Words that take `seconds` at 150 wpm. */
const wordsFor = (seconds: number) => Math.round((seconds / 60) * WPM);

describe('chunk audio checks', () => {
  it('passes speech-like audio of the expected length', () => {
    const check = checkChunk(tonePcm(20), MIME, wordsFor(20), WPM);
    expect(check.problems).toEqual([]);
    expect(check.seconds).toBeCloseTo(20);
    expect(check.ratio).toBeCloseTo(1, 1);
  });

  it('fails a chunk that is far too short or too long for its words', () => {
    expect(checkChunk(tonePcm(3), MIME, wordsFor(20), WPM).problems.join()).toMatch(/ratio 0\.15/);
    expect(checkChunk(tonePcm(40), MIME, wordsFor(20), WPM).problems.join()).toMatch(/ratio 2\.00/);
    expect(checkChunk(tonePcm(12.5), MIME, wordsFor(20), WPM).problems).toEqual([]);
  });

  it('fails silent audio', () => {
    const check = checkChunk(tonePcm(20, true), MIME, wordsFor(20), WPM);
    expect(check.problems.join()).toContain('effectively silent');
  });

  it('fails audio with more than 20% silent seconds', () => {
    const pcm = Buffer.concat([tonePcm(7), tonePcm(3, true)]);
    expect(checkChunk(pcm, MIME, wordsFor(10), WPM).problems.join()).toContain('30% of the audio is silent');
    const ok = Buffer.concat([tonePcm(8), tonePcm(2, true)]);
    expect(checkChunk(ok, MIME, wordsFor(10), WPM).problems).toEqual([]);
  });

  it('measures one level per second', () => {
    const levels = windowLevels(Buffer.concat([tonePcm(2), tonePcm(1, true)]));
    expect(levels).toHaveLength(3);
    expect(levels[0]).toBeGreaterThan(-20);
    expect(levels[2]).toBe(-Infinity);
  });

  it('checks the format and sample rate', () => {
    expect(checkMimeType(MIME)).toEqual([]);
    expect(checkMimeType('audio/pcm')).toEqual([]);
    expect(checkMimeType('audio/L16;rate=44100').join()).toContain('44100');
    expect(checkMimeType('audio/mpeg').join()).toContain('unexpected audio format');
    expect(checkMimeType(undefined).join()).toContain('none');
  });

  it('retries a first audio failure and stops on the second', () => {
    expect(classify(new AudioQaError('silent', false))).toBe('retry');
    expect(classify(new AudioQaError('silent', true))).toBe('fatal');
  });
});

describe('WAV duration', () => {
  it('reads it from the header', () => {
    expect(wavSeconds(pcmToWav(Buffer.alloc(SAMPLE_RATE * 2 * 3)))).toBeCloseTo(3);
    expect(wavSeconds(silence(300))).toBeCloseTo(0.3);
    expect(wavSeconds(chimes([{ freq: 440, start: 0, length: 1 }], 3))).toBeCloseTo(3);
  });

  it('rejects other files', () => {
    expect(() => wavSeconds(Buffer.from('ID3 not a wav at all'))).toThrow('not a WAV');
  });
});

describe('episode reconciliation', () => {
  const parts = { introSeconds: 3, outroSeconds: 3, chunkSeconds: [120, 150, 60], gapSeconds: 0.3 };

  it('adds up intro, chunks, gaps and outro', () => {
    expect(expectedEpisodeSeconds(parts)).toBeCloseTo(3 + 3 + 330 + 0.3 * 4);
  });

  it('accepts an MP3 that matches its parts and the target', () => {
    expect(reconcile({ ...parts, mp3Seconds: 337.5, targetMinutes: 5 })).toEqual([]);
  });

  it('rejects a 3-second episode (the intro-only bug)', () => {
    const problems = reconcile({ ...parts, mp3Seconds: 3.1, targetMinutes: 12 });
    expect(problems.join()).toContain('assembly dropped or added audio');
    expect(problems.join()).toContain('under 0.6');
  });

  it('rejects an episode that is fine against its parts but too short for the target', () => {
    expect(reconcile({ ...parts, chunkSeconds: [100], mp3Seconds: 107.6, targetMinutes: 12 }).join()).toContain('under 0.6');
  });

  it('rejects a duration that is not a number', () => {
    expect(reconcile({ ...parts, mp3Seconds: Number.NaN, targetMinutes: 5 })).toEqual(['MP3 duration is not a number (NaN)']);
  });
});

describe('ffprobe and silencedetect output', () => {
  it('parses a duration', () => {
    expect(parseDuration('731.208000\n')).toBeCloseTo(731.208);
  });

  it('throws on N/A, NaN and empty output', () => {
    expect(() => parseDuration('N/A\n')).toThrow('no usable duration');
    expect(() => parseDuration('nan')).toThrow('no usable duration');
    expect(() => parseDuration('')).toThrow('no usable duration');
    expect(() => parseDuration('0.000000')).toThrow('no usable duration');
  });

  it('sums silences, including one still open at the end', () => {
    const stderr = [
      '[silencedetect @ 0x1] silence_start: 10.5',
      '[silencedetect @ 0x1] silence_end: 13.5 | silence_duration: 3',
      '[silencedetect @ 0x1] silence_start: 95',
    ].join('\n');
    expect(parseSilence(stderr, 100)).toBeCloseTo(8);
    expect(parseSilence('size=N/A time=00:01:40.00', 100)).toBe(0);
  });
});

describe('published audio check', () => {
  const good = { duration: 600.4, metaDuration: 600, targetMinutes: 12, bytes: 9_700_000, bitrateBps: 128_000, silence: 4 };

  it('passes a normal episode', () => {
    expect(publishedAudioProblems(good)).toEqual([]);
  });

  it('flags each problem', () => {
    expect(publishedAudioProblems({ ...good, duration: Number.NaN })[0]).toContain('not a usable number');
    expect(publishedAudioProblems({ ...good, metaDuration: 590 }).join()).toContain('meta.json says 590s');
    expect(publishedAudioProblems({ ...good, duration: 400, metaDuration: 400 }).join()).toContain('under 0.6');
    expect(publishedAudioProblems({ ...good, bytes: 1_000_000 }).join()).toContain('bytes');
    expect(publishedAudioProblems({ ...good, silence: 120 }).join()).toContain('20% of the MP3 is silence');
  });
});

describe('file naming', () => {
  it('makes a unique MP3 name per run', () => {
    expect(audioFileName('2026-10-16', '123456', '2')).toBe('signal-check-2026-10-16-r123456-2.mp3');
    expect(audioFileName('2026-10-16')).toBe('signal-check-2026-10-16-rlocal-1.mp3');
  });

  it('reads the configured bitrate', () => {
    expect(bitrateBps('128k')).toBe(128_000);
    expect(bitrateBps('96000')).toBe(96_000);
    expect(() => bitrateBps('fast')).toThrow();
  });
});
