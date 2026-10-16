/**
 * Send a short status message to Telegram and/or ntfy. Does nothing if neither is configured.
 * Usage: npm run notify -- success|failure|dry
 * Env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, NTFY_TOPIC.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config';

const status = process.argv[2] ?? 'success';
const config = loadConfig();
const env = process.env;
const outDir = env.SC_OUT ?? 'out';
const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
const meta = existsSync(join(outDir, 'meta.json')) ? JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8')) : undefined;
const errorFile = join(outDir, 'error.txt');
const reason = existsSync(errorFile) ? readFileSync(errorFile, 'utf8').trim().split('\n')[0]!.slice(0, 300) : '';

const text =
  status === 'success' && meta
    ? `${config.show.title} is ready: ${meta.title} (${Math.round(meta.durationSeconds / 60)} min)\n${config.show.site_url}/episodes/${meta.date}.html`
    : status === 'dry'
      ? `${config.show.title} dry run finished. Review and transcript: ${runUrl}`
      : `${config.show.title} run failed${reason ? `: ${reason}` : '.'}\n${runUrl}`;

const sends: Promise<Response>[] = [];
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
  sends.push(
    fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: false }),
    }),
  );
}
if (env.NTFY_TOPIC) {
  sends.push(fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, { method: 'POST', headers: { title: config.show.title }, body: text }));
}
if (!sends.length) {
  console.log('[notify] no Telegram or ntfy configured; skipping');
} else {
  for (const res of await Promise.allSettled(sends)) {
    if (res.status === 'rejected' || !res.value.ok) console.warn(`[notify] send failed: ${res.status === 'rejected' ? res.reason : res.value.status}`);
  }
  console.log('[notify] sent');
}
