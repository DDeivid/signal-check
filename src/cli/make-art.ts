/**
 * Make (or remake) the image for an episode that is already published, e.g. one from before images existed.
 * Usage: npm run art -- [YYYY-MM-DD]   (default: the newest episode). Writes data/art/<date>.webp and
 * updates the episode in data/episodes.json. Unlike in a daily run, a failure here fails the command.
 */
import { mkdirSync } from 'node:fs';
import { makeArt } from '../art';
import { loadConfig } from '../config';
import { readHistory, writeHistory } from '../history';

const config = loadConfig();
const history = readHistory();
const date = process.argv[2]?.trim() || history.at(-1)?.date;
const episode = history.find((e) => e.date === date);
if (!episode) throw new Error(`No published episode for "${date ?? '(none)'}" in data/episodes.json`);
if (!config.art.enabled) throw new Error('art.enabled is false in podcast.config.yaml');

mkdirSync('data/art', { recursive: true });
const file = `data/art/${episode.date}.webp`;
const art = await makeArt(config, episode.title, episode.stories[0], file);
if (!art) {
  console.error(`[art] no image for episode ${episode.number}; see the warning above`);
  process.exit(1);
}
episode.art = { file, ...art };
episode.models = [...(episode.models ?? []).filter((b) => b.role !== 'Art'), { role: 'Art', models: [art.model] }];
writeHistory(history);
console.log(`[art] episode ${episode.number} (${episode.date}): ${file}, theme colour ${art.color}`);
