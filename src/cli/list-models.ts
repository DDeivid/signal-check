/** List the Gemini models this API key can call for text generation, so llm.models / tts.models can be checked. */
import { appendFileSync } from 'node:fs';
import { loadConfig } from '../config';
import { gemini } from '../llm';

const config = loadConfig();
const names: string[] = [];
for await (const model of await gemini().models.list({ config: { pageSize: 100 } })) {
  if (model.name && model.supportedActions?.includes('generateContent')) names.push(model.name.replace(/^models\//, ''));
}
names.sort();

const configured = [...config.llm.models, ...config.tts.models];
const missing = configured.filter((m) => !names.includes(m));
const report = [
  `## Gemini models: ${names.length} available`,
  '```',
  ...names.map((n) => `${configured.includes(n) ? '*' : ' '} ${n}`),
  '```',
  missing.length ? `Configured but not listed (aliases may still work): ${missing.join(', ')}` : 'All configured models are listed.',
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
