/**
 * After the MP3 is attached to a GitHub release: add the episode to data/episodes.json
 * and keep its transcript and show notes under data/. A re-run on the same day replaces that day's entry.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
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
  transcriptFile,
  notesFile,
};
writeHistory([...history, record]);
console.log(`[register] episode ${record.number}: ${record.title}`);
