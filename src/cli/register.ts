/**
 * After the MP3 is attached to a GitHub release: add the episode to data/episodes.json
 * and keep its transcript, show notes and image under data/. A re-run on the same day replaces that day's entry.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type EpisodeRecord, readHistory, writeHistory } from '../history';

const outDir = process.env.SC_OUT ?? 'out';
const repo = process.env.GITHUB_REPOSITORY;
if (!repo) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');

const meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
mkdirSync('data/transcripts', { recursive: true });
mkdirSync('data/notes', { recursive: true });
const transcriptFile = `data/transcripts/${meta.date}.md`;
const notesFile = `data/notes/${meta.date}.md`;
copyFileSync(join(outDir, 'transcript.md'), transcriptFile);
copyFileSync(join(outDir, 'notes.md'), notesFile);
let art: EpisodeRecord['art'];
if (meta.art && existsSync(join(outDir, meta.art.file))) {
  mkdirSync('data/art', { recursive: true });
  art = { file: `data/art/${meta.date}.webp`, color: meta.art.color, model: meta.art.model };
  copyFileSync(join(outDir, meta.art.file), art.file);
}

const history = readHistory().filter((e) => e.date !== meta.date);
const record: EpisodeRecord = {
  number: (history.at(-1)?.number ?? 0) + 1,
  date: meta.date,
  publishedAt: meta.publishedAt,
  weekday: meta.weekday,
  segment: meta.segment,
  title: meta.title,
  description: meta.description,
  audioUrl: `https://github.com/${repo}/releases/download/${meta.tag}/${meta.file}`,
  audioBytes: meta.bytes,
  durationSeconds: meta.durationSeconds,
  stories: meta.stories,
  predictions: meta.predictions,
  openThreads: meta.openThreads,
  ...(meta.predictionGrades ? { predictionGrades: meta.predictionGrades } : {}),
  ...(meta.models ? { models: meta.models } : {}),
  ...(art ? { art } : {}),
  transcriptFile,
  notesFile,
};
writeHistory([...history, record]);
console.log(`[register] episode ${record.number}: ${record.title}`);
