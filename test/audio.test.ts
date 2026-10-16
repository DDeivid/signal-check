import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleEpisode, durationSeconds, probeSeconds, silenceSeconds } from '../src/audio';
import { reconcile, wavSeconds } from '../src/audio-qa';
import { loadConfig } from '../src/config';
import { tonePcm } from '../src/fake-ai';
import { chimes, pcmToWav } from '../src/wav';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

// Runs in CI (ffmpeg installed there); skipped on machines without ffmpeg.
describe.skipIf(!hasFfmpeg)('episode assembly', () => {
  const config = loadConfig();

  it('joins intro, voiced parts with gaps and outro into an MP3 of the right length', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-audio-'));
    const part = chimes([{ freq: 440, start: 0, length: 5 }], 5);
    const mp3 = join(dir, 'episode.mp3');
    assembleEpisode(config, [part, part], dir, mp3, { title: 'Test', artist: 'Test' });
    // 3 s intro + 2 × 5 s parts + 3 gaps + 3 s outro ≈ 17 s
    expect(durationSeconds(mp3)).toBeGreaterThanOrEqual(16);
    expect(durationSeconds(mp3)).toBeLessThanOrEqual(18);
  });

  it('reconciles the MP3 with its parts and measures silence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-audio-'));
    const parts = [pcmToWav(tonePcm(30)), pcmToWav(Buffer.concat([tonePcm(10), tonePcm(10, true)]))];
    const mp3 = join(dir, 'episode.mp3');
    assembleEpisode(config, parts, dir, mp3, { title: 'Test', artist: 'Test' });
    const seconds = probeSeconds(mp3);
    const problems = reconcile({
      mp3Seconds: seconds,
      introSeconds: wavSeconds(readFileSync(config.audio.intro)),
      outroSeconds: wavSeconds(readFileSync(config.audio.outro)),
      chunkSeconds: parts.map(wavSeconds),
      gapSeconds: config.audio.gap_ms / 1000,
      targetMinutes: 1,
    });
    expect(problems).toEqual([]);
    expect(silenceSeconds(mp3, seconds)).toBeGreaterThan(8);
  });
});
