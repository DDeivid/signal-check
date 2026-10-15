/** Fetch every feed and market symbol once and report what works. Exits 1 if anything failed. */
import { appendFileSync } from 'node:fs';
import { loadConfig } from '../config';
import { collectNews } from '../feeds';
import { fetchQuotes, quotesTable } from '../markets';

const STALE_DAYS = 14;
const config = loadConfig();
const now = new Date();
const { results } = await collectNews(config, new Date(0), now, new Set());
const { quotes, failures } = await fetchQuotes(config);

const rows = results.map((r) => {
  const age = r.newest ? Math.floor((now.getTime() - r.newest.getTime()) / 86_400_000) : undefined;
  const status = !r.ok ? 'FAILED' : r.items === 0 ? 'EMPTY' : age !== undefined && age > STALE_DAYS ? 'STALE' : 'ok';
  const detail = r.ok ? `${r.items} items, newest ${age ?? '?'} days ago` : r.error;
  return { status, line: `| ${status} | ${r.name} | ${detail} | ${r.url} |` };
});
const bad = rows.filter((r) => r.status !== 'ok');

const report = [
  `## Feeds: ${rows.length - bad.length}/${rows.length} ok`,
  '| Status | Feed | Detail | URL |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => r.line),
  '',
  `## Markets: ${quotes.length}/${config.markets.instruments.length} ok`,
  '```',
  quotesTable(quotes),
  ...failures.map((f) => `FAILED ${f}`),
  '```',
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
if (bad.length || failures.length) process.exit(1);
