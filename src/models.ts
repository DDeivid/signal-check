import type { ModelUse } from './llm';

/** One badge: what a model did for the episode, and which model(s) did it. */
export interface ModelBadge {
  role: string;
  models: string[];
}

/** Stage labels (as logged by llm.ts) grouped into the roles shown on the site. */
const ROLES: Array<{ role: string; match: (label: string) => boolean }> = [
  { role: 'Research', match: (l) => l === 'select' || l.startsWith('research') || l === 'grade' },
  { role: 'Script', match: (l) => l === 'write' || l === 'revise' },
  { role: 'Fact-check', match: (l) => l === 'fact-check' },
];

const failed = (model: string) => model === '(none)' || model.endsWith('(failed)');

/** The models that actually answered, per role, in order of first use. The exact version wins over an alias. */
export function textBadges(uses: readonly ModelUse[]): ModelBadge[] {
  return ROLES.flatMap(({ role, match }) => {
    const models = [...new Set(uses.filter((u) => match(u.label) && !failed(u.model)).map((u) => u.version || u.model))];
    return models.length ? [{ role, models }] : [];
  });
}

export function episodeBadges(text: ModelBadge[], voiceModel: string): ModelBadge[] {
  return [...text, { role: 'Voices', models: [voiceModel] }];
}

const WORDS: Record<string, string> = { gemini: 'Gemini', gemma: 'Gemma', flash: 'Flash', lite: 'Lite', pro: 'Pro', tts: 'TTS' };

/** "gemini-3.1-flash-tts-preview" → "Gemini 3.1 Flash TTS preview"; other providers' ids are kept as they are. */
export function modelLabel(id: string): string {
  const bare = id.replace(/^models\//, '').replace(/^openrouter:/, '');
  if (!/^(gemini|gemma)-/.test(bare)) return bare;
  return bare
    .split('-')
    .map((w) => WORDS[w] ?? w)
    .join(' ');
}

/** "Script: Gemini 3.7 Flash · Voices: Gemini 3.1 Flash TTS preview" */
export function badgeLine(badges: ModelBadge[]): string {
  return badges.map((b) => `${b.role}: ${b.models.map(modelLabel).join(', ')}`).join(' · ');
}
