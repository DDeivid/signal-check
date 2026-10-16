import { execFileSync } from 'node:child_process';
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

export function durationSeconds(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
  return Math.round(Number(out.trim()));
}
