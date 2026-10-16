/**
 * Independent check of the finished MP3, run after produce and before the release step.
 * Reads out/meta.json and the MP3 it names; exits 1 with the reasons if the audio isn't publishable.
 */
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bitrateBps, probeSeconds, silenceSeconds } from '../audio';
import { publishedAudioProblems } from '../audio-qa';
import { loadConfig } from '../config';

const outDir = process.env.SC_OUT ?? 'out';

function fail(message: string): never {
  console.error(`::error::validate-audio: ${message}`);
  process.exit(1);
}

let meta: { file: string; durationSeconds: number; targetMinutes: number };
try {
  meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
} catch (err) {
  fail(`can't read ${outDir}/meta.json: ${(err as Error).message}`);
}
if (!meta.file || typeof meta.targetMinutes !== 'number') fail('meta.json has no file or targetMinutes');

const mp3 = join(outDir, meta.file);
let duration: number;
let silence: number;
try {
  duration = probeSeconds(mp3);
  silence = silenceSeconds(mp3, duration);
} catch (err) {
  fail(`${mp3}: ${(err as Error).message}`);
}
const bytes = statSync(mp3).size;
const bps = bitrateBps(loadConfig().audio.bitrate);
const problems = publishedAudioProblems({ duration, metaDuration: meta.durationSeconds, targetMinutes: meta.targetMinutes, bytes, bitrateBps: bps, silence });

const line = `${meta.file}: ${duration.toFixed(1)}s (meta ${meta.durationSeconds}s, target ${meta.targetMinutes} min), ${bytes} bytes, ${silence.toFixed(1)}s silence`;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `## Audio check: ${problems.length ? 'FAILED' : 'passed'}`,
      '| File | Duration | meta.json | Target | Bytes | Silence |',
      '| --- | --- | --- | --- | --- | --- |',
      `| ${meta.file} | ${duration.toFixed(1)}s | ${meta.durationSeconds}s | ${meta.targetMinutes} min | ${bytes} | ${silence.toFixed(1)}s (${Math.round((silence / duration) * 100)}%) |`,
      ...problems.map((p) => `- ${p}`),
      '',
    ].join('\n'),
  );
}
if (problems.length) fail(`${line}\n- ${problems.join('\n- ')}`);
console.log(`[validate-audio] ok: ${line}`);
