/** Build the GitHub Pages site (index, episode pages, transcripts, feed.xml) into _site/. */
import { loadConfig } from '../config';
import { readHistory } from '../history';
import { buildSite } from '../site';

const config = loadConfig();
const episodes = readHistory();
buildSite(config, episodes, process.env.SC_SITE ?? '_site');
console.log(`[site] built ${episodes.length} episodes into _site/`);
