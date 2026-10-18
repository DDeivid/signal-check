/**
 * Make (or remake) the image for an episode that is already published, e.g. one from before images existed.
 * Usage: npm run art -- [YYYY-MM-DD]   (default: the newest episode). Writes data/art/<date>.webp and
 * updates the episode in data/episodes.json. Unlike in a daily run, a failure here fails the command.
 *
 * Trying styles: SC_ART_STYLE="<style>" replaces art.style; several styles can be separated by "||".
 * With SC_ART_PREVIEW=true nothing in data/ changes: one image per style goes to out/art-preview/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeArt } from '../art';
import { loadConfig } from '../config';
import { readHistory, writeHistory } from '../history';

const config = loadConfig();
const history = readHistory();
const date = process.argv[2]?.trim() || history.at(-1)?.date;
const episode = history.find((e) => e.date === date);
if (!episode) throw new Error(`No published episode for "${date ?? '(none)'}" in data/episodes.json`);
if (!config.art.enabled) throw new Error('art.enabled is false in podcast.config.yaml');
const styles = (process.env.SC_ART_STYLE ?? '').split('||').map((s) => s.trim()).filter(Boolean);
const lead = episode.stories[0];

if (process.env.SC_ART_PREVIEW === 'true') {
  const dir = 'out/art-preview';
  mkdirSync(dir, { recursive: true });
  const list = styles.length ? styles : [config.art.style];
  const index: string[] = [`# Image previews for episode ${episode.number} (${episode.date})`, '', `Lead story: ${lead?.title}`, ''];
  let made = 0;
  for (const [n, style] of list.entries()) {
    const file = `${dir}/${n + 1}.webp`;
    console.log(`\n[art] style ${n + 1}: ${style}`);
    const art = await makeArt({ ...config, art: { ...config.art, style } }, lead, file);
    if (art) made++;
    index.push(`## ${n + 1}.webp${art ? ` (${art.model}, theme colour ${art.color})` : ' (failed)'}`, '', style, '');
  }
  writeFileSync(`${dir}/styles.md`, index.join('\n'));
  if (!made) process.exit(1);
  console.log(`\n[art] ${made}/${list.length} previews in ${dir}; nothing in data/ changed`);
} else {
  if (styles.length > 1) throw new Error('Several styles only work with SC_ART_PREVIEW=true');
  mkdirSync('data/art', { recursive: true });
  const file = `data/art/${episode.date}.webp`;
  const art = await makeArt(styles[0] ? { ...config, art: { ...config.art, style: styles[0] } } : config, lead, file);
  if (!art) {
    console.error(`[art] no image for episode ${episode.number}; see the warning above`);
    process.exit(1);
  }
  episode.art = { file, ...art };
  episode.models = [...(episode.models ?? []).filter((b) => b.role !== 'Art'), { role: 'Art', models: [art.model] }];
  writeHistory(history);
  console.log(`[art] episode ${episode.number} (${episode.date}): ${file}, theme colour ${art.color}`);
}
