/**
 * Voice a short sample dialogue with several voice pairs, to pick Mia's and Theo's voices.
 * Env: SC_VOICES="Aoede+Charon,Kore+Puck" (Mia+Theo). Output: out/voices/*.mp3 (or .wav without ffmpeg).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config';
import { sleep } from '../llm';
import { speakChunk } from '../tts';

const DEFAULT_PAIRS = 'Aoede+Charon,Kore+Puck,Leda+Orus,Zephyr+Fenrir,Despina+Iapetus';

const config = loadConfig();
const [mia, theo] = config.hosts;
const sample = [
  { speaker: mia!.name, text: `Good morning, this is ${config.show.title}. I'm ${mia!.name}.` },
  { speaker: theo!.name, text: `And I'm ${theo!.name}. Big one today: a new AI model claims it can review code better than most senior engineers.` },
  { speaker: mia!.name, text: "Which is a bold claim. What's actually in the paper?" },
  { speaker: theo!.name, text: "A benchmark they built themselves, which is the first thing I'd want someone else to check. The numbers look good. The test set is small." },
  { speaker: mia!.name, text: "So, promising, but nobody outside the company has tried it yet." },
  { speaker: theo!.name, text: 'Exactly. Ask me again in a month.' },
];

const pairs = (process.env.SC_VOICES || DEFAULT_PAIRS).split(',').map((p) => p.trim().split('+'));
const dir = join(process.env.SC_OUT ?? 'out', 'voices');
mkdirSync(dir, { recursive: true });

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfmpeg = false;
}

for (const [n, [a, b]] of pairs.entries()) {
  if (!a || !b) throw new Error(`Bad voice pair "${pairs[n]?.join('+')}"; use Mia+Theo, e.g. Aoede+Charon`);
  if (n > 0) await sleep(config.tts.seconds_between_requests * 1000);
  const name = `${mia!.name}-${a}_${theo!.name}-${b}`;
  console.log(`[voice-test] ${name}`);
  const pair = { ...config, hosts: [{ ...mia!, voice: a }, { ...theo!, voice: b }] };
  const wav = await speakChunk(pair, sample, `voice:${name}`);
  const wavFile = join(dir, `${name}.wav`);
  writeFileSync(wavFile, wav);
  if (hasFfmpeg) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavFile, '-b:a', '128k', join(dir, `${name}.mp3`)]);
    rmSync(wavFile);
  }
}
console.log(`[voice-test] samples in ${dir}`);
