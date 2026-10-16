import { describe, expect, it } from 'vitest';
import { withModels } from '../src/feed';
import type { EpisodeRecord } from '../src/history';
import { badgeLine, episodeBadges, modelLabel, textBadges } from '../src/models';
import { badges } from '../src/site';

describe('model badges', () => {
  it('groups the models that answered by role, preferring the exact version', () => {
    const uses = [
      { label: 'select', model: 'gemini-flash-latest', version: 'gemini-3.8-flash', fallbacks: [] },
      { label: 'research:s4', model: 'gemini-3.7-flash', fallbacks: [] },
      { label: 'write', model: 'gemini-3.7-flash', fallbacks: [] },
      { label: 'revise', model: 'gemini-flash-lite-latest', fallbacks: [] },
      { label: 'fact-check', model: 'gemini-3.5-flash (failed)', fallbacks: [] },
      { label: 'fact-check', model: '(none)', fallbacks: [] },
      { label: 'fact-check', model: 'gemini-flash-lite-latest', fallbacks: [] },
    ];
    expect(textBadges(uses)).toEqual([
      { role: 'Research', models: ['gemini-3.8-flash', 'gemini-3.7-flash'] },
      { role: 'Script', models: ['gemini-3.7-flash', 'gemini-flash-lite-latest'] },
      { role: 'Fact-check', models: ['gemini-flash-lite-latest'] },
    ]);
    expect(episodeBadges([], 'gemini-3.1-flash-tts-preview')).toEqual([{ role: 'Voices', models: ['gemini-3.1-flash-tts-preview'] }]);
  });

  it('labels model ids readably', () => {
    expect(modelLabel('gemini-3.1-flash-tts-preview')).toBe('Gemini 3.1 Flash TTS preview');
    expect(modelLabel('models/gemini-flash-lite-latest')).toBe('Gemini Flash Lite latest');
    expect(modelLabel('openrouter:deepseek/deepseek-v4-flash')).toBe('deepseek/deepseek-v4-flash');
    expect(badgeLine([{ role: 'Script', models: ['gemini-3.7-flash'] }, { role: 'Voices', models: ['gemini-3.1-flash-tts-preview'] }])).toBe(
      'Script: Gemini 3.7 Flash · Voices: Gemini 3.1 Flash TTS preview',
    );
  });

  const episode = (models?: EpisodeRecord['models']): EpisodeRecord => ({
    number: 1, date: '2026-10-19', publishedAt: '2026-10-19T05:20:00Z', weekday: 'monday', segment: 'look_back',
    title: 'T', description: 'D', audioUrl: 'https://x/a.mp3', audioBytes: 1, durationSeconds: 700,
    stories: [], predictions: [], openThreads: [], transcriptFile: '', notesFile: '', ...(models ? { models } : {}),
  });

  it('renders escaped pills on the site, and nothing for episodes without models', () => {
    const html = badges(episode([{ role: 'Script', models: ['gemini-3.7-flash'] }, { role: 'Voices', models: ['<x>'] }]));
    expect(html).toContain('<li class="badge"><b>Script</b> Gemini 3.7 Flash</li>');
    expect(html).toContain('&lt;x&gt;');
    expect(badges(episode())).toBe('');
  });

  it('adds a Models line to the feed notes', () => {
    expect(withModels('Notes', episode([{ role: 'Voices', models: ['gemini-3.1-flash-tts-preview'] }]))).toBe(
      'Notes\n\nModels: Voices: Gemini 3.1 Flash TTS preview',
    );
    expect(withModels('Notes', episode())).toBe('Notes');
  });
});
