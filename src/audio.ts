import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Config } from './config';
import { chimes, INTRO_NOTES, OUTRO_NOTES, silence } from './wav';

/** Write the placeholder jingles if they don't exist yet. */
export function ensureJingles(config: Config): void {
  if (!existsSync(config.audio.intro)) writeFileSync(config.audio.intro, chimes(INTRO_NOTES, 3));
  if (!existsSync(config.audio.outro)) writeFileSync(config.audio.outro, chimes(OUTRO_NOTES, 3));
}

/** Intro, voiced chunks with short gaps, outro → loudness-normalised MP3. */
export function assembleEpisode(config: Config, parts: Buffer[], dir: string, mp3: string, meta: { title: string; artist: string }): void {
  ensureJingles(config);
  const work = join(dir, 'audio');
  mkdirSync(work, { recursive: true });
  // ffmpeg's concat demuxer resolves relative paths against the list file's folder, so every path is absolute.
  const gap = resolve(work, 'gap.wav');
  writeFileSync(gap, silence(config.audio.gap_ms));
  const files = [resolve(config.audio.intro), gap];
  parts.forEach((part, n) => {
    const file = resolve(work, `part-${String(n + 1).padStart(2, '0')}.wav`);
    writeFileSync(file, part);
    files.push(file, gap);
  });
  files.push(resolve(config.audio.outro));
  const list = join(work, 'list.txt');
  writeFileSync(list, files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', config.audio.bitrate,
    '-metadata', `title=${meta.title}`, '-metadata', `artist=${meta.artist}`,
    mp3,
  ]);
}

/** ffprobe's duration output as seconds. Throws on "N/A", empty or anything else that isn't a positive number. */
export function parseDuration(output: string): number {
  const text = output.trim();
  const seconds = Number(text);
  if (!text || !Number.isFinite(seconds) || seconds <= 0) throw new Error(`ffprobe gave no usable duration ("${text.slice(0, 40)}")`);
  return seconds;
}

/** Exact duration in seconds (fractional). */
export function probeSeconds(file: string): number {
  return parseDuration(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

/** Whole seconds, as stored in meta.json and the feed. */
export function durationSeconds(file: string): number {
  return Math.round(probeSeconds(file));
}

/** Total silence in ffmpeg silencedetect output. A silence still open at the end runs to `duration`. */
export function parseSilence(stderr: string, duration: number): number {
  let total = 0;
  let open: number | undefined;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const at = Number(m[2]);
    if (m[1] === 'start') open = Math.max(at, 0);
    else if (open !== undefined) {
      total += at - open;
      open = undefined;
    }
  }
  if (open !== undefined) total += Math.max(duration - open, 0);
  return total;
}

/** Seconds of silence (below -50 dB for at least 2 s) in an audio file. */
export function silenceSeconds(file: string, duration: number): number {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-50dB:d=2', '-f', 'null', '-'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg silencedetect failed: ${(result.stderr ?? '').slice(-300)}`);
  return parseSilence(result.stderr, duration);
}

/** Unique per run, so a re-made episode never overwrites (or is cached as) an earlier upload. */
export function audioFileName(date: string, runId = 'local', attempt = '1'): string {
  return `signal-check-${date}-r${runId}-${attempt}.mp3`;
}

/** "128k" → 128000 bits per second. */
export function bitrateBps(bitrate: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(k?)$/i.exec(bitrate.trim());
  if (!m) throw new Error(`Unreadable audio.bitrate "${bitrate}"`);
  return Number(m[1]) * (m[2] ? 1000 : 1);
}
