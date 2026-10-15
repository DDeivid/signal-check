import type { Config } from './config';
import type { EpisodeRecord } from './history';

export const escapeXml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const inline = (s: string) =>
  escapeXml(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, text: string, url: string) => `<a href="${url}">${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/** Minimal Markdown → HTML for the notes and transcripts this project writes itself. */
export function markdownToHtml(md: string): string {
  return md
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      if (block === '---') return '<hr>';
      const heading = /^(#{1,3}) (.*)$/.exec(block);
      if (heading) return `<h${heading[1]!.length + 1}>${inline(heading[2]!)}</h${heading[1]!.length + 1}>`;
      if (block.split('\n').every((l) => l.startsWith('- '))) {
        return `<ul>${block.split('\n').map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${block.split('\n').map(inline).join('<br>')}</p>`;
    })
    .join('\n');
}

export function hms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export const episodePath = (e: EpisodeRecord) => `episodes/${e.date}.html`;

export function buildFeed(config: Config, episodes: EpisodeRecord[], notes: (e: EpisodeRecord) => string): string {
  const { show } = config;
  const site = show.site_url;
  const items = [...episodes]
    .reverse()
    .map(
      (e) => `    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${site}/${episodePath(e)}</link>
      <guid isPermaLink="false">signal-check-${e.date}</guid>
      <pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${markdownToHtml(notes(e)).replaceAll(']]>', ']]&gt;')}]]></description>
      <itunes:summary>${escapeXml(e.description)}</itunes:summary>
      <enclosure url="${escapeXml(e.audioUrl)}" length="${e.audioBytes}" type="audio/mpeg"/>
      <itunes:duration>${hms(e.durationSeconds)}</itunes:duration>
      <itunes:episode>${e.number}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>${show.explicit}</itunes:explicit>
      <podcast:transcript url="${site}/transcripts/${e.date}.html" type="text/html"/>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <link>${site}</link>
    <atom:link href="${site}/feed.xml" rel="self" type="application/rss+xml"/>
    <language>${show.language}</language>
    <description>${escapeXml(show.description)}</description>
    <itunes:summary>${escapeXml(show.description)}</itunes:summary>
    <itunes:author>${escapeXml(show.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(show.owner_name)}</itunes:name>${show.owner_email ? `\n      <itunes:email>${escapeXml(show.owner_email)}</itunes:email>` : ''}
    </itunes:owner>
    <itunes:image href="${site}/cover.png"/>
    <image><url>${site}/cover.png</url><title>${escapeXml(show.title)}</title><link>${site}</link></image>
${show.categories.map((c) => `    <itunes:category text="${escapeXml(c)}"/>`).join('\n')}
    <itunes:explicit>${show.explicit}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <podcast:locked>no</podcast:locked>
    <generator>signal-check</generator>
${items}
  </channel>
</rss>
`;
}
