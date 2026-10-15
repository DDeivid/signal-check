import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const HISTORY_PATH = 'data/episodes.json';

export interface StoryRecord {
  title: string;
  url: string;
  topic: string;
  summary: string;
}

export interface Prediction {
  text: string;
  by: string;
}

/** One published episode. Written to data/episodes.json by `npm run register`. */
export interface EpisodeRecord {
  number: number;
  date: string;
  publishedAt: string;
  weekday: string;
  segment: string;
  title: string;
  description: string;
  audioUrl: string;
  audioBytes: number;
  durationSeconds: number;
  stories: StoryRecord[];
  predictions: Prediction[];
  openThreads: string[];
  /** Markdown transcript, relative to the repo root. */
  transcriptFile: string;
  /** Show notes markdown, relative to the repo root. */
  notesFile: string;
}

export function readHistory(path = HISTORY_PATH): EpisodeRecord[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as EpisodeRecord[];
}

export function writeHistory(episodes: EpisodeRecord[], path = HISTORY_PATH): void {
  writeFileSync(path, `${JSON.stringify(episodes, null, 2)}\n`);
}

export function lastPublished(episodes: EpisodeRecord[]): Date | undefined {
  const last = episodes.at(-1);
  return last ? new Date(last.publishedAt) : undefined;
}

/** Episodes published within `days` before `now`, oldest first. */
export function recentEpisodes(episodes: EpisodeRecord[], now: Date, days: number): EpisodeRecord[] {
  const from = now.getTime() - days * 86_400_000;
  return episodes.filter((e) => new Date(e.publishedAt).getTime() >= from);
}
