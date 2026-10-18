import type { ModelBadge } from './models';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const HISTORY_PATH = 'data/episodes.json';

export interface StoryRecord {
  title: string;
  url: string;
  topic: string;
  summary: string;
  /** A few words for the story list on the site; older episodes don't have one. */
  label?: string;
}

export interface Prediction {
  text: string;
  by: string;
}

/** A prediction graded on a Friday prediction check. */
export interface PredictionGrade {
  text: string;
  by: string;
  /** Number of the episode the prediction was made in. */
  episode: number;
  verdict: 'right' | 'wrong' | 'too_early';
  evidence: string;
  /** 1 the first time it is graded; a too_early grade is carried to the next check until attempt 3. */
  attempt?: number;
}

export interface EpisodeArt {
  /** WebP image, relative to the repo root (data/art/<date>.webp). */
  file: string;
  /** Theme colour picked from the image, #RRGGBB. */
  color: string;
  model: string;
  /** The look drawn from art.looks, so it isn't drawn again soon. */
  look?: string;
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
  /** Prediction check episodes: the grades given in this episode. */
  predictionGrades?: PredictionGrade[];
  /** Which models did what, for the badges on the site. Missing on early episodes. */
  models?: ModelBadge[];
  /** The episode illustration and its theme colour. Missing when no image was made. */
  art?: EpisodeArt;
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
