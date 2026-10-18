/**
 * Make (or remake) the image for an episode that is already published, e.g. one from before images existed.
 * Usage: npm run art -- [YYYY-MM-DD]   (default: the newest episode). Writes data/art/<date>.webp and
 * updates the episode in data/episodes.json. Unlike in a daily run, a failure here fails the command.
 *
 * Trying styles: SC_ART_STYLE="<style>" replaces art.style; several styles can be separated by "||".
 * With SC_ART_PREVIEW=true nothing in data/ changes: one image per style goes to out/art-preview/.
 * SC_ART_STORY="1,3" (previews only) illustrates those stories of the episode instead of the lead (story 1).
 * Each image draws a random look; in a preview, looks drawn earlier in the run count as recent, so none repeat.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeArt, recentLooks } from '../art';
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
const before = recentLooks(config, history.filter((e) => e.date !== episode.date));
const storyNumbers = (process.env.SC_ART_STORY ?? '').split(',').map((n) => Number(n.trim())).filter((n) => n >= 1 && n <= episode.stories.length);

if (process.env.SC_ART_PREVIEW === 'true') {
  const dir = 'out/art-preview';
  mkdirSync(dir, { recursive: true });
  const list = styles.length ? styles : [config.art.style];
  const stories = storyNumbers.length ? storyNumbers : [1];
  const index: string[] = [`# Image previews for episode ${episode.number} (${episode.date})`, ''];
  let made = 0;
  const used = [...before];
  for (const story of stories) {
    for (const [n, style] of list.entries()) {
      const name = `story${story}-style${n + 1}.webp`;
      const pick = episode.stories[story - 1];
      console.log(`\n[art] story ${story} (${pick?.title}), style ${n + 1}: ${style}`);
      const art = await makeArt({ ...config, art: { ...config.art, style } }, pick, `${dir}/${name}`, used.slice(-config.art.no_repeat));
      if (art) made++;
      if (art?.look) used.push(art.look);
      index.push(`## ${name}${art ? ` (${art.model}, theme colour ${art.color})` : ' (failed)'}`, '', `Story: ${pick?.title}`, '', `Look: ${art?.look ?? '(none)'}`, '', style, '');
    }
  }
  writeFileSync(`${dir}/styles.md`, index.join('\n'));
  if (!made) process.exit(1);
  console.log(`\n[art] ${made}/${stories.length * list.length} previews in ${dir}; nothing in data/ changed`);
} else {
  if (styles.length > 1) throw new Error('Several styles only work with SC_ART_PREVIEW=true');
  mkdirSync('data/art', { recursive: true });
  const file = `data/art/${episode.date}.webp`;
  const art = await makeArt(styles[0] ? { ...config, art: { ...config.art, style: styles[0] } } : config, lead, file, before);
  if (!art) {
    console.error(`[art] no image for episode ${episode.number}; see the warning above`);
    process.exit(1);
  }
  episode.art = { file, ...art };
  episode.models = [...(episode.models ?? []).filter((b) => b.role !== 'Art'), { role: 'Art', models: [art.model] }];
  writeHistory(history);
  console.log(`[art] episode ${episode.number} (${episode.date}): ${file}, theme colour ${art.color}`);
}
