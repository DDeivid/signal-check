import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardTheme, fromHex, fromHsl, toHex, toHsl } from './color';
import type { Config } from './config';
import { buildFeed, episodePath, escapeXml as esc, markdownToHtml } from './feed';
import type { EpisodeRecord } from './history';
import { modelLabel } from './models';

/**
 * The site: one feed of episode cards (the newest open in full, older ones compact), episode pages and
 * transcripts. Each card takes its colours from its image's theme colour; the page itself stays neutral,
 * in light or dark (system setting, or the viewer's choice in the header).
 */
const STYLE = `
:root {
  --dark: 0;
  --bg: #F6F6F3; --fg: #15171A; --muted: #5D6168; --line: #DDDDD6; --chip: #FFFFFF;
  --serif: "Instrument Serif", Georgia, "Times New Roman", serif;
  --sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-mode="light"]) { color-scheme: dark; --dark: 1; --bg: #0F1012; --fg: #EEEEEA; --muted: #A2A5AB; --line: #2A2C30; --chip: #1A1B1E; }
}
:root[data-mode="dark"] { color-scheme: dark; --dark: 1; --bg: #0F1012; --fg: #EEEEEA; --muted: #A2A5AB; --line: #2A2C30; --chip: #1A1B1E; }
:root[data-mode="light"] { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 var(--sans); padding-inline: 16px; padding-block: 0 56px; }
button { font: inherit; color: inherit; cursor: pointer; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }
.wrap { max-width: 1180px; margin: 0 auto; }
.feed { display: grid; gap: 14px; }

.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); margin-inline: -16px; padding: 12px 16px; }
.bar .wrap { display: flex; align-items: center; gap: 12px 18px; flex-wrap: wrap; }
.brand { font: 400 28px/1 var(--serif); margin-right: auto; text-decoration: none; }
.modes { display: inline-flex; background: var(--chip); border: 1px solid var(--line); border-radius: 999px; padding: 3px; }
.modes button { border: 0; background: transparent; padding: 5px 12px; border-radius: 999px; font-size: 13px; color: var(--muted); }
.modes button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
.rss { font-size: 13px; color: var(--muted); text-decoration: none; }
.intro { margin: 8px 0 0; color: var(--muted); font-size: 15px; max-width: 70ch; }
.week { margin: 22px 0 0; font: italic 400 26px/1 var(--serif); }

.card {
  --accent: color-mix(in srgb, var(--acc-d) calc(var(--dark) * 100%), var(--acc-l));
  --on-accent: color-mix(in srgb, var(--on-d) calc(var(--dark) * 100%), var(--on-l));
  --tint: color-mix(in srgb, var(--tint-d) calc(var(--dark) * 100%), var(--tint-l));
  --soft: color-mix(in srgb, var(--accent) 22%, transparent);
  position: relative; border-radius: 22px; overflow: hidden; background: var(--tint); isolation: isolate;
}
.card .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: right center; z-index: -2; display: block; }
.ai-tag { position: absolute; right: 12px; bottom: 12px; z-index: 1; font-size: 11px; letter-spacing: .04em; padding: 3px 8px; border-radius: 999px; background: rgba(0, 0, 0, .55); color: #fff; }
.mini .ai-tag { bottom: 10px; }
.card .shade { position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, var(--tint) 0%, var(--tint) 32%, color-mix(in srgb, var(--tint) 72%, transparent) 48%, transparent 72%); }
.content { position: relative; }
.eyebrow { margin: 0; font: 500 12px/1.3 var(--sans); letter-spacing: .12em; text-transform: uppercase; color: var(--accent); display: flex; flex-wrap: wrap; gap: 4px 10px; }
.eyebrow span + span::before { content: "·"; margin-right: 10px; opacity: .6; }
.card h2 { margin: 0; font-family: var(--serif); font-weight: 400; text-wrap: balance; }
.card h2 a { text-decoration: none; }
.card h2 a:hover { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 5px; }
.ico-play, .ico-pause { width: 18px; height: 18px; }
[aria-pressed="true"] > .ico-play, [aria-pressed="false"] > .ico-pause { display: none; }

.card.big { min-height: 540px; display: flex; }
.big .content { width: min(560px, 100%); padding: clamp(24px, 4vw, 48px); display: flex; flex-direction: column; gap: 16px; }
.big h2 { font-size: clamp(44px, 6.2vw, 78px); line-height: .95; letter-spacing: -.01em; }
.desc { margin: 0; color: var(--muted); max-width: 54ch; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.btn-play { display: inline-flex; align-items: center; gap: 10px; border: 0; padding: 12px 22px 12px 18px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 16px; }
.btn-play .t { font-size: 12px; opacity: .8; font-variant-numeric: tabular-nums; }
.btn-ghost { display: inline-flex; align-items: center; padding: 11px 18px; border-radius: 999px; background: var(--soft); text-decoration: none; font-weight: 500; }
.progress { height: 4px; background: var(--soft); border-radius: 2px; overflow: hidden; max-width: 420px; cursor: pointer; }
.progress span { display: block; height: 100%; width: 0; background: var(--accent); }
.tl { list-style: none; margin: 4px 0 0; padding: 0; display: grid; }
.tl li { position: relative; padding: 0 0 10px 24px; font-size: 14px; line-height: 1.4; }
.tl li::before { content: ""; position: absolute; left: 4px; top: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--tint); border: 2px solid var(--accent); }
.tl li::after { content: ""; position: absolute; left: 7px; top: 16px; bottom: -2px; width: 2px; background: var(--soft); }
.tl li:last-child::after { display: none; }
.tl li:first-child::before { background: var(--accent); }
.tl a { text-decoration: none; }
.tl a:hover { text-decoration: underline; text-underline-offset: 3px; }
.tl .more, .tl .more a { color: var(--muted); font-size: 13px; }
.foot { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.badge { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: var(--soft); }
.badge b { font-weight: 600; }
.collapse { border: 0; background: none; padding: 0; color: var(--muted); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
.lead .collapse, .page .collapse { display: none; }

.card.mini { min-height: 168px; display: flex; align-items: center; }
.mini .content { display: grid; grid-template-columns: auto 1fr; gap: 6px 18px; align-items: center; padding: 22px clamp(18px, 3vw, 32px); width: min(640px, 100%); }
.mini h2 { font-size: clamp(26px, 3vw, 34px); line-height: 1; }
.round { grid-row: span 2; width: 52px; height: 52px; border-radius: 50%; border: 0; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; }
.big .round, .mini .desc, .mini .actions, .mini .tl, .mini .foot { display: none; }
.mini .progress { grid-column: 2; max-width: 100%; height: 3px; margin-top: 4px; }
.mini .progress:not(.on) { display: none; }

.prose { max-width: 68ch; margin: 32px auto 0; }
.prose h2, .prose h3 { font: 400 30px/1.1 var(--serif); margin: 32px 0 10px; }
.prose a { text-underline-offset: 3px; }
.prose li { margin-bottom: 6px; }
.prose hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
.page-title { font: 400 clamp(36px, 5vw, 56px)/1 var(--serif); margin: 24px 0 0; text-wrap: balance; }

@media (max-width: 720px) {
  .card.big { min-height: 0; }
  .big .art { height: 280px; object-position: center; }
  .big .shade { background: linear-gradient(180deg, transparent 0, transparent 150px, var(--tint) 280px); }
  .big .content { padding-top: 230px; }
  .card.mini { min-height: 140px; }
  .mini .shade { background: linear-gradient(90deg, var(--tint) 0%, var(--tint) 45%, color-mix(in srgb, var(--tint) 60%, transparent) 70%, transparent 100%); }
  .round { width: 44px; height: 44px; }
}
`;

/** Theme choice before the first paint, so a dark page never flashes light. */
const HEAD_SCRIPT = `try{var m=localStorage.getItem("sc-theme");if(m==="light"||m==="dark")document.documentElement.dataset.mode=m}catch(e){}`;

/** Theme buttons, one player at a time, opening and closing compact cards. */
const SCRIPT = `(() => {
  const root = document.documentElement;
  const modes = document.querySelectorAll('[data-mode-choice]');
  const setMode = (m) => {
    if (m === 'auto') delete root.dataset.mode; else root.dataset.mode = m;
    modes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modeChoice === m)));
    try { localStorage.setItem('sc-theme', m); } catch (e) {}
  };
  setMode(root.dataset.mode || 'auto');
  modes.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeChoice)));

  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  let current = null;
  document.querySelectorAll('.card audio').forEach((audio) => {
    const card = audio.closest('.card');
    const fill = card.querySelector('.progress span');
    const time = card.querySelector('.btn-play .t');
    const show = (playing) => {
      card.querySelectorAll('[data-play]').forEach((b) => {
        b.setAttribute('aria-pressed', String(playing));
        const label = b.querySelector('.lbl');
        if (label) label.textContent = playing ? 'Pause' : 'Play';
      });
      if (playing) card.querySelector('.progress').classList.add('on');
    };
    audio.addEventListener('play', () => show(true));
    audio.addEventListener('pause', () => show(false));
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      fill.style.width = (audio.currentTime / audio.duration) * 100 + '%';
      if (time) time.textContent = mmss(audio.currentTime) + ' / ' + mmss(audio.duration);
    });
  });
  document.addEventListener('click', (ev) => {
    const play = ev.target.closest('[data-play]');
    if (play) {
      const audio = play.closest('.card').querySelector('audio');
      if (audio.paused) { if (current && current !== audio) current.pause(); current = audio; audio.play().catch(() => {}); } else audio.pause();
      return;
    }
    const bar = ev.target.closest('.progress');
    if (bar) {
      const audio = bar.closest('.card').querySelector('audio');
      const box = bar.getBoundingClientRect();
      if (audio.duration) audio.currentTime = ((ev.clientX - box.left) / box.width) * audio.duration;
      return;
    }
    const open = ev.target.closest('.mini h2 a');
    if (open) {
      ev.preventDefault();
      const card = open.closest('.card');
      card.classList.replace('mini', 'big');
      open.setAttribute('aria-expanded', 'true');
      card.querySelector('.collapse').focus({ preventScroll: true });
      return;
    }
    const close = ev.target.closest('.collapse');
    if (close) {
      const card = close.closest('.card');
      const link = card.querySelector('h2 a');
      card.classList.replace('big', 'mini');
      link.setAttribute('aria-expanded', 'false');
      card.scrollIntoView({ block: 'nearest' });
      link.focus({ preventScroll: true });
    }
  });
})();`;

const ICONS = `<svg class="ico-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4v16l14-8z"/></svg><svg class="ico-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>`;

interface PageOptions {
  root?: string;
  /** Open Graph tags for episode pages. */
  og?: { title: string; description: string; image?: string; url: string };
}

function page(config: Config, title: string, body: string, { root = '.', og }: PageOptions = {}): string {
  const meta = og
    ? [
        `<meta property="og:title" content="${esc(og.title)}">`,
        `<meta property="og:description" content="${esc(og.description)}">`,
        `<meta property="og:url" content="${esc(og.url)}">`,
        `<meta property="og:type" content="article">`,
        ...(og.image ? [`<meta property="og:image" content="${esc(og.image)}">`, `<meta name="twitter:card" content="summary_large_image">`] : []),
      ].join('\n')
    : '';
  return `<!doctype html>
<html lang="${config.show.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(og?.description ?? config.show.description)}">
${meta}
<link rel="alternate" type="application/rss+xml" title="${esc(config.show.title)}" href="${root}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<script>${HEAD_SCRIPT}</script>
<style>${STYLE}</style>
</head>
<body>
<header class="bar"><div class="wrap">
<a class="brand" href="${root}/">${esc(config.show.title)}</a>
<div class="modes" role="group" aria-label="Theme">
<button type="button" data-mode-choice="auto" aria-pressed="true">Auto</button><button type="button" data-mode-choice="light" aria-pressed="false">Light</button><button type="button" data-mode-choice="dark" aria-pressed="false">Dark</button>
</div>
<a class="rss" href="${root}/feed.xml">RSS feed</a>
</div></header>
<main class="wrap">
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** Small pills: "Script Gemini 3.7 Flash", "Voices Gemini 3.1 Flash TTS preview". Nothing for early episodes. */
export const badges = (e: EpisodeRecord) =>
  e.models?.length
    ? `<ul class="badges" aria-label="Models used">${e.models
        .map((b) => `<li class="badge"><b>${esc(b.role)}</b> ${esc(b.models.map(modelLabel).join(', '))}</li>`)
        .join('')}</ul>`
    : '';

const day = (e: EpisodeRecord) => new Date(`${e.date}T12:00:00Z`);
const longDate = (e: EpisodeRecord) => day(e).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const artPath = (e: EpisodeRecord) => `art/${e.date}.webp`;
export const hasArt = (e: EpisodeRecord) => Boolean(e.art && existsSync(e.art.file));

/** The card's colours as CSS custom properties. */
export function cardStyle(color: string): string {
  const t = cardTheme(color);
  return `--acc-l:${t.accentLight};--acc-d:${t.accentDark};--on-l:${t.onAccentLight};--on-d:${t.onAccentDark};--tint-l:${t.tintLight};--tint-d:${t.tintDark}`;
}

function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Drawn ridgelines in the card's colour, for episodes without an image. Same picture for the same date. */
export function fallbackArt(date: string, color: string): string {
  const r = rng(date);
  const [h] = toHsl(fromHex(color));
  const c = (s: number, l: number) => toHex(fromHsl(h, s, l));
  const W = 1600;
  const H = 900;
  const sx = W * (0.66 + r() * 0.14);
  const sy = H * (0.28 + r() * 0.12);
  const ridges = Array.from({ length: 6 }, (_, i) => {
    const t = i / 5;
    const base = H * (0.5 + t * 0.4);
    const amp = H * (0.16 - t * 0.07);
    const p = [r() * 9, r() * 9];
    const pts: string[] = [];
    for (let x = 0; x <= W; x += 40) {
      const env = 0.35 + 0.65 * Math.exp(-(((x - sx) / (W * 0.28)) ** 2));
      pts.push(`${x},${Math.round(base - amp * env * Math.abs(Math.sin(x / 140 + p[0]!) * 0.7 + Math.sin(x / 47 + p[1]!) * 0.3))}`);
    }
    return `<path d="M0,${H} L${pts.join(' L')} L${W},${H} Z" fill="${c(0.35 - t * 0.15, 0.26 - t * 0.19)}" stroke="${c(0.7, 0.62)}" stroke-opacity="${0.35 - t * 0.05}" stroke-width="2"/>`;
  }).join('');
  return `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"><defs><linearGradient id="sky-${date}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(0.4, 0.1)}"/><stop offset=".75" stop-color="${c(0.5, 0.3)}"/></linearGradient><radialGradient id="glow-${date}"><stop offset="0" stop-color="${c(0.85, 0.72)}" stop-opacity=".55"/><stop offset="1" stop-color="${c(0.85, 0.72)}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#sky-${date})"/><circle cx="${sx}" cy="${sy}" r="${H * 0.5}" fill="url(#glow-${date})"/><circle cx="${sx}" cy="${sy}" r="${H * 0.09}" fill="${c(0.85, 0.75)}"/>${ridges}</svg>`;
}

interface CardOptions {
  root: string;
  open: boolean;
  /** The newest episode on the index, or the episode page: always open, no "Show less". */
  fixed?: 'lead' | 'page';
  eager?: boolean;
}

const STORIES_SHOWN = 6;

export function card(config: Config, e: EpisodeRecord, { root, open, fixed, eager }: CardOptions): string {
  const color = hasArt(e) ? e.art!.color : config.art.fallback_color;
  const art = hasArt(e)
    ? `<img class="art" src="${root}/${artPath(e)}" alt="" width="1600" height="900"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}><span class="ai-tag">AI image</span>`
    : fallbackArt(e.date, color);
  const href = `${root}/${episodePath(e)}`;
  const shown = e.stories.slice(0, STORIES_SHOWN);
  const rest = e.stories.length - shown.length;
  const title = fixed === 'page' ? esc(e.title) : `<a href="${href}"${fixed ? '' : ` aria-expanded="${open}"`}>${esc(e.title)}</a>`;
  return `<article class="card ${open ? 'big' : 'mini'}${fixed ? ` ${fixed}` : ''}" id="ep-${e.date}" style="${cardStyle(color)}">
${art}<div class="shade"></div>
<div class="content">
<button type="button" class="round" data-play aria-pressed="false" aria-label="Play episode ${e.number}">${ICONS}</button>
<p class="eyebrow"><span>Episode ${e.number}</span><span>${longDate(e)}</span><span>${Math.max(1, Math.round(e.durationSeconds / 60))} min</span></p>
<h2>${title}</h2>
<p class="desc">${esc(e.description)}</p>
<div class="actions"><button type="button" class="btn-play" data-play aria-pressed="false" aria-label="Play episode ${e.number}">${ICONS}<span class="lbl">Play</span><span class="t">${mmss(e.durationSeconds)}</span></button>${fixed === 'page' ? '' : `<a class="btn-ghost" href="${href}">Show notes</a>`}<a class="btn-ghost" href="${root}/transcripts/${e.date}.html">Transcript</a></div>
<div class="progress" aria-hidden="true"><span></span></div>
${shown.length ? `<ul class="tl" aria-label="Stories in this episode">${shown.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a></li>`).join('')}${rest > 0 ? `<li class="more"><a href="${href}">${rest} more ${rest === 1 ? 'story' : 'stories'} in the notes</a></li>` : ''}</ul>` : ''}
<div class="foot">${badges(e)}<button type="button" class="collapse">Show less</button></div>
</div>
<audio preload="none" src="${esc(e.audioUrl)}"></audio>
</article>`;
}

/** "Week of 12 October" (with the year when it isn't the newest episode's year). */
function weekHeading(e: EpisodeRecord, year: number): string {
  const d = day(e);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC', ...(monday.getUTCFullYear() !== year ? { year: 'numeric' } : {}) };
  return `Week of ${monday.toLocaleDateString('en-GB', opts)}`;
}

export function indexBody(config: Config, episodes: EpisodeRecord[]): string {
  const newest = [...episodes].reverse();
  const intro = `<p class="intro">${esc(config.show.tagline)} AI-hosted by ${config.hosts.map((h) => esc(h.name)).join(' and ')}.</p>`;
  if (!newest.length) return `${intro}\n<p>The first episode is on its way.</p>`;
  const year = day(newest[0]!).getUTCFullYear();
  let week = '';
  const parts = newest.map((e, i) => {
    const heading = weekHeading(e, year);
    const head = heading === week ? '' : `<h3 class="week">${heading}</h3>\n`;
    week = heading;
    return head + card(config, e, { root: '.', open: i === 0, ...(i === 0 ? { fixed: 'lead' as const, eager: true } : {}) });
  });
  return `${intro}\n<div class="feed">\n${parts.join('\n')}\n</div>`;
}

export function buildSite(config: Config, episodes: EpisodeRecord[], outDir: string): void {
  for (const dir of ['', 'episodes', 'transcripts', 'art']) mkdirSync(join(outDir, dir), { recursive: true });
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const notes = (e: EpisodeRecord) => read(e.notesFile) || e.description;
  const site = config.show.site_url.replace(/\/$/, '');

  writeFileSync(join(outDir, 'index.html'), page(config, config.show.title, indexBody(config, episodes)));

  for (const e of episodes) {
    if (hasArt(e)) copyFileSync(e.art!.file, join(outDir, artPath(e)));
    writeFileSync(
      join(outDir, episodePath(e)),
      page(
        config,
        `${e.title} · ${config.show.title}`,
        `${card(config, e, { root: '..', open: true, fixed: 'page', eager: true })}
<section class="prose">${markdownToHtml(notes(e))}
<p><a href="../transcripts/${e.date}.html">Read the transcript</a></p></section>`,
        {
          root: '..',
          og: { title: e.title, description: e.description, url: `${site}/${episodePath(e)}`, image: hasArt(e) ? `${site}/${artPath(e)}` : `${site}/cover.png` },
        },
      ),
    );
    writeFileSync(
      join(outDir, 'transcripts', `${e.date}.html`),
      page(
        config,
        `Transcript: ${e.title}`,
        `<h1 class="page-title">${esc(e.title)}</h1>\n<section class="prose"><p><a href="../${episodePath(e)}">Back to the episode</a></p>\n${markdownToHtml(read(e.transcriptFile).replace(/^# .*\n+/, '') || 'Transcript not available.')}</section>`,
        { root: '..' },
      ),
    );
  }

  writeFileSync(join(outDir, 'feed.xml'), buildFeed(config, episodes, notes));
  if (existsSync('assets/cover.png')) copyFileSync('assets/cover.png', join(outDir, 'cover.png'));
  else console.warn('::warning::assets/cover.png is missing; run "npm run cover". Spotify needs a 1400-3000 px square cover.');
  writeFileSync(join(outDir, '.nojekyll'), '');
}
