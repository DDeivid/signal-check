import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleEpisode, durationSeconds } from '../src/audio';
import { loadConfig } from '../src/config';
import { chimes } from '../src/wav';

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
  it('joins intro, voiced parts with gaps and outro into an MP3 of the right length', () => {
    const config = loadConfig();
    const dir = mkdtempSync(join(tmpdir(), 'sc-audio-'));
    const part = chimes([{ freq: 440, start: 0, length: 5 }], 5);
    const mp3 = join(dir, 'episode.mp3');
    assembleEpisode(config, [part, part], dir, mp3, { title: 'Test', artist: 'Test' });
    // 3 s intro + 2 × 5 s parts + 3 gaps + 3 s outro ≈ 17 s
    expect(durationSeconds(mp3)).toBeGreaterThanOrEqual(16);
    expect(durationSeconds(mp3)).toBeLessThanOrEqual(18);
  });
});
