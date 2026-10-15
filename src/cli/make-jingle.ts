/** Regenerate the placeholder intro/outro chimes in assets/. */
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../config';
import { chimes, INTRO_NOTES, OUTRO_NOTES } from '../wav';

const config = loadConfig();
writeFileSync(config.audio.intro, chimes(INTRO_NOTES, 3));
writeFileSync(config.audio.outro, chimes(OUTRO_NOTES, 3));
console.log(`[jingle] wrote ${config.audio.intro} and ${config.audio.outro}`);
