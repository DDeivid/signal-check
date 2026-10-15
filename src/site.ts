import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
import { buildFeed, episodePath, escapeXml as esc, markdownToHtml } from './feed';
import type { EpisodeRecord } from './history';

const STYLE = `
:root { --ink: #0E1A3A; --signal: #FFD21F; --paper: #FFFBEA; --muted: #4A5370; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { background: var(--signal); padding: 32px 16px; }
header .wrap, main { max-width: 720px; margin: 0 auto; }
h1, h2 { font-family: "Archivo Black", system-ui, sans-serif; font-weight: 400; line-height: 1.15; margin: 0 0 8px; }
h1 { font-size: 40px; }
h2 { font-size: 22px; }
main { padding: 24px 16px 64px; }
a { color: var(--ink); }
.tagline { margin: 0; font-size: 18px; }
.links { margin-top: 12px; font-size: 15px; }
.ep { border-top: 2px solid var(--ink); padding: 20px 0; }
.meta { color: var(--muted); font-size: 14px; }
audio { width: 100%; margin: 8px 0; }
.cover { width: 112px; height: 112px; border-radius: 8px; float: right; margin-left: 16px; }
@media (max-width: 520px) { h1 { font-size: 30px; } .cover { width: 72px; height: 72px; } }
`;

function page(config: Config, title: string, body: string, root = '.'): string {
  return `<!doctype html>
<html lang="${config.show.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="alternate" type="application/rss+xml" title="${esc(config.show.title)}" href="${root}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<header><div class="wrap">
<img class="cover" src="${root}/cover.png" alt="">
<h1><a href="${root}/" style="text-decoration:none">${esc(config.show.title)}</a></h1>
<p class="tagline">${esc(config.show.tagline)}</p>
<p class="links"><a href="${root}/feed.xml">RSS feed</a> · AI-hosted by ${config.hosts.map((h) => esc(h.name)).join(' and ')}</p>
</div></header>
<main>
${body}
</main>
</body>
</html>
`;
}

const when = (e: EpisodeRecord) =>
  `${new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${Math.round(e.durationSeconds / 60)} min`;

export function buildSite(config: Config, episodes: EpisodeRecord[], outDir: string): void {
  for (const dir of ['', 'episodes', 'transcripts']) mkdirSync(join(outDir, dir), { recursive: true });
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const notes = (e: EpisodeRecord) => read(e.notesFile) || e.description;

  const list = [...episodes]
    .reverse()
    .map(
      (e) => `<article class="ep">
<h2><a href="${episodePath(e)}">${esc(e.title)}</a></h2>
<div class="meta">Episode ${e.number} · ${when(e)}</div>
<audio controls preload="none" src="${esc(e.audioUrl)}"></audio>
<p>${esc(e.description)}</p>
</article>`,
    )
    .join('\n');
  writeFileSync(join(outDir, 'index.html'), page(config, config.show.title, `<p>${esc(config.show.description)}</p>\n${list || '<p>The first episode is on its way.</p>'}`));

  for (const e of episodes) {
    writeFileSync(
      join(outDir, episodePath(e)),
      page(
        config,
        `${e.title} · ${config.show.title}`,
        `<h2>${esc(e.title)}</h2>
<div class="meta">Episode ${e.number} · ${when(e)}</div>
<audio controls preload="none" src="${esc(e.audioUrl)}"></audio>
${markdownToHtml(notes(e))}
<p><a href="../transcripts/${e.date}.html">Read the transcript</a></p>`,
        '..',
      ),
    );
    writeFileSync(
      join(outDir, 'transcripts', `${e.date}.html`),
      page(config, `Transcript: ${e.title}`, markdownToHtml(read(e.transcriptFile) || 'Transcript not available.'), '..'),
    );
  }

  writeFileSync(join(outDir, 'feed.xml'), buildFeed(config, episodes, notes));
  if (existsSync('assets/cover.png')) copyFileSync('assets/cover.png', join(outDir, 'cover.png'));
  else console.warn('::warning::assets/cover.png is missing; run "npm run cover". Spotify needs a 1400-3000 px square cover.');
  writeFileSync(join(outDir, '.nojekyll'), '');
}
