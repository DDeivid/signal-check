/**
 * Full rehearsal without internet or API keys: the real pipeline with the fake AI client, fixture feeds and a
 * fixture market table, in a temp copy of the working state. Proves three things:
 *   1. a good run goes produce → validate-audio → register → build-site and yields a feed with one sane item;
 *      with its image (out/art.webp → data/art → the site) and the image's theme colour on its card;
 *   2. a voice-only rerun (SC_RESUME_SCRIPT) from that run's script.json yields a valid episode too, even with
 *      the image model failing (the episode publishes without an image);
 *   3. a silent TTS chunk stops the run before meta.json is written (or validate-audio rejects it).
 * Exit 0 if every expectation holds, 1 if any fails, 2 if ffmpeg/ffprobe are missing.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tsx = join(root, 'node_modules', '.bin', 'tsx');
const failures: string[] = [];

const has = (cmd: string) => spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0;
if (!has('ffmpeg') || !has('ffprobe')) {
  console.error('[rehearsal] ffmpeg and ffprobe are required (brew install ffmpeg / apt-get install ffmpeg). Nothing was run.');
  process.exit(2);
}

function expect(ok: boolean, what: string): void {
  console.log(`[rehearsal] ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
}

/** A temp working copy: assets, an empty episode history, and the config with call spacing removed. */
function workspace(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `sc-rehearsal-${name}-`));
  cpSync(join(root, 'assets'), join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'data', 'transcripts'), { recursive: true });
  mkdirSync(join(dir, 'data', 'notes'), { recursive: true });
  writeFileSync(join(dir, 'data', 'episodes.json'), '[]\n');
  const config = parse(readFileSync(join(root, 'podcast.config.yaml'), 'utf8'));
  config.llm.min_seconds_between_calls = 0;
  config.tts.seconds_between_requests = 0;
  writeFileSync(join(dir, 'podcast.config.yaml'), stringify(config));
  return dir;
}

function step(dir: string, script: string, env: Record<string, string> = {}): number {
  const base = { ...process.env };
  for (const key of ['GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'SC_CONFIG', 'SC_OUT', 'SC_SITE', 'SC_DRY_RUN', 'SC_SKIP_IF_PUBLISHED', 'SC_NOTES', 'SC_RESUME_SCRIPT', 'SC_RESUME_ALLOW_OTHER_DATE', 'SC_FAKE_ART_FAIL']) delete base[key];
  console.log(`\n[rehearsal] --- ${script} (${dir})`);
  const result = spawnSync(tsx, [join(root, 'src', 'cli', script)], {
    cwd: dir,
    stdio: 'inherit',
    env: {
      ...base,
      SC_FAKE_AI: 'true',
      SC_FIXTURE_FEEDS: join(root, 'test', 'fixtures', 'feeds.json'),
      SC_FIXTURE_MARKETS: join(root, 'test', 'fixtures', 'markets.json'),
      SC_WEEKDAY: 'thursday',
      SC_MINUTES: '5',
      GITHUB_RUN_ID: 'rehearsal',
      GITHUB_RUN_ATTEMPT: '1',
      ...env,
    },
  });
  return result.status ?? 1;
}

const seconds = (hms: string) => hms.split(':').reduce((total, part) => total * 60 + Number(part), 0);

function goodRun(): void {
  const dir = workspace('good');
  expect(step(dir, 'produce.ts') === 0, 'produce succeeds');
  expect(step(dir, 'validate-audio.ts') === 0, 'validate-audio passes');
  expect(step(dir, 'register.ts', { GITHUB_REPOSITORY: 'test/signal-check' }) === 0, 'register succeeds');
  expect(step(dir, 'build-site.ts') === 0, 'build-site succeeds');

  const metaFile = join(dir, 'out', 'meta.json');
  const feedFile = join(dir, '_site', 'feed.xml');
  if (!existsSync(metaFile) || !existsSync(feedFile)) {
    expect(false, 'meta.json and _site/feed.xml exist');
    cleanUp(dir);
    return;
  }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const xml = readFileSync(feedFile, 'utf8');
  const mp3Bytes = statSync(join(dir, 'out', meta.file)).size;
  const length = Number(/<enclosure [^>]*length="(\d+)"/.exec(xml)?.[1]);
  const duration = seconds(/<itunes:duration>([\d:]+)<\/itunes:duration>/.exec(xml)?.[1] ?? '0');
  expect((xml.match(/<item>/g) ?? []).length === 1, 'feed has exactly 1 item');
  expect(length === mp3Bytes, `enclosure length (${length}) matches the MP3 size (${mp3Bytes})`);
  expect(duration > 60, `itunes:duration (${duration}s) is over 60s`);
  expect(/^signal-check-\d{4}-\d\d-\d\d-rrehearsal-1\.mp3$/.test(meta.file), `MP3 name is unique per run (${meta.file})`);
  expect(typeof meta.ttsModel === 'string' && meta.targetMinutes === 5, 'meta.json records ttsModel and targetMinutes');
  const roles = (meta.models ?? []).map((b: { role: string }) => b.role).join(',');
  expect(roles === 'Research,Script,Fact-check,Voices,Art', `meta.json records the models per role (${roles})`);
  const index = readFileSync(join(dir, '_site', 'index.html'), 'utf8');
  expect(xml.includes('Models: Research:') && index.includes('class="badge"'), 'feed and site show the model badges');
  const history = JSON.parse(readFileSync(join(dir, 'data', 'episodes.json'), 'utf8'));
  const art = history[0]?.art;
  expect(/^#[0-9A-F]{6}$/.test(meta.art?.color ?? '') && existsSync(join(dir, 'out', 'art.webp')), `produce writes art.webp and its theme colour (${meta.art?.color})`);
  expect(art?.file === `data/art/${meta.date}.webp` && existsSync(join(dir, art.file)), 'register keeps the image under data/art');
  expect(existsSync(join(dir, '_site', 'art', `${meta.date}.webp`)) && index.includes(`<img class="art" src="./art/${meta.date}.webp"`), 'the site shows the image');
  expect(index.includes('<article class="card big lead"') && index.includes('--acc-l:#'), "the newest card is open and coloured from its image");
  expect(existsSync(join(dir, 'out', 'tts.json')) && existsSync(join(dir, 'out', 'summary.md')), 'tts.json and summary.md are written');
  resumeRun(dir, meta);
  cleanUp(dir);
}

/** Voice-only rerun from the good run's script.json (copied aside, as from a downloaded artifact), into a fresh out folder. */
function resumeRun(dir: string, original: { title: string; stories: unknown[] }): void {
  const prev = join(dir, 'prev');
  mkdirSync(prev, { recursive: true });
  for (const f of ['script.json', 'notes.md']) cpSync(join(dir, 'out', f), join(prev, f));
  const env = { SC_RESUME_SCRIPT: join(prev, 'script.json'), SC_OUT: 'out-resume', SC_WEEKDAY: 'monday', SC_FAKE_ART_FAIL: 'true' };
  expect(step(dir, 'produce.ts', env) === 0, 'produce resumes from script.json (with the image model failing)');
  expect(step(dir, 'validate-audio.ts', { SC_OUT: 'out-resume' }) === 0, 'validate-audio passes on the resumed run');
  const metaFile = join(dir, 'out-resume', 'meta.json');
  if (!existsSync(metaFile)) {
    expect(false, 'the resumed run writes meta.json');
    return;
  }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  expect(meta.title === original.title && JSON.stringify(meta.stories) === JSON.stringify(original.stories), 'the resumed meta.json keeps the title and stories');
  expect(!meta.art && !existsSync(join(dir, 'out-resume', 'art.webp')), 'a failed image leaves the episode without one, not failed');
  expect(meta.segment === 'markets', `the resumed run keeps the script's format, not SC_WEEKDAY (${meta.segment})`);
  expect(!existsSync(join(dir, 'out-resume', 'selection.json')) && !existsSync(join(dir, 'out-resume', 'materials.md')), 'the resumed run skips selection and writing');
  expect(readFileSync(join(dir, 'out-resume', 'notes.md'), 'utf8') === readFileSync(join(prev, 'notes.md'), 'utf8'), "the resumed run uses the earlier run's notes.md");
}

/** Keep the workspace for inspection if anything failed. */
function cleanUp(dir: string): void {
  if (failures.length) console.log(`[rehearsal] kept ${dir} for inspection`);
  else rmSync(dir, { recursive: true, force: true });
}

function silentChunkRun(): void {
  const dir = workspace('silent');
  const produced = step(dir, 'produce.ts', { SC_FAKE_SILENT_CHUNK: '2' });
  const metaWritten = existsSync(join(dir, 'out', 'meta.json'));
  const rejected = produced !== 0 && !metaWritten ? true : step(dir, 'validate-audio.ts') !== 0;
  expect(rejected, `a silent chunk is stopped (produce exit ${produced}, meta.json ${metaWritten ? 'written' : 'not written'})`);
  expect(existsSync(join(dir, 'out', 'error.txt')), 'error.txt names the failing stage');
  if (existsSync(join(dir, 'out', 'error.txt'))) console.log(`[rehearsal] error.txt: ${readFileSync(join(dir, 'out', 'error.txt'), 'utf8').split('\n').slice(0, 2).join(' | ')}`);
  cleanUp(dir);
}

goodRun();
silentChunkRun();
if (failures.length) {
  console.error(`\n[rehearsal] ${failures.length} expectation(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\n[rehearsal] all expectations hold');
