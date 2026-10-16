import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { loadResume, type SavedScript } from '../src/resume';
import { emptyRun, summaryMarkdown } from '../src/run-summary';

const config = loadConfig();
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const script: SavedScript = {
  date: '2026-10-16',
  weekday: 'friday',
  segment: 'prediction_check',
  targetMinutes: 12,
  title: 'T',
  description: 'D',
  sections: [
    { id: 'opening', title: 'Opening', lines: [{ speaker: 'Mia', text: 'Good morning.' }] },
    { id: 'headlines', title: 'Headlines', lines: [{ speaker: 'Theo', text: 'First.' }] },
    { id: 'closing', title: 'Closing', lines: [{ speaker: 'Theo', text: 'Bye.' }] },
  ],
  stories: [{ title: 'S', url: 'https://x/1', topic: 'world', summary: 's' }],
  predictions: [{ text: 'P', by: 'Theo' }],
  open_threads: ['O'],
  story_summaries: [],
  predictionGrades: [{ text: 'Q', by: 'Mia', episode: 3, verdict: 'too_early', evidence: 'e', attempt: 1 }],
  textModels: [{ role: 'Script', models: ['gemini-3.7-flash'] }],
};

/** A folder like an earlier run's out/: script.json and, optionally, notes.md. */
function earlierRun(content: unknown, notes?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-resume-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'script.json'), JSON.stringify(content));
  if (notes !== undefined) writeFileSync(join(dir, 'notes.md'), notes);
  return join(dir, 'script.json');
}

describe('resume', () => {
  it("loads today's script with the notes.md next to it", () => {
    const resumed = loadResume(config, earlierRun(script, '# Notes'), '2026-10-16', false);
    expect(resumed.script).toEqual(script);
    expect(resumed.notes).toBe('# Notes');
  });

  it('works without notes.md (the caller rebuilds them)', () => {
    expect(loadResume(config, earlierRun(script), '2026-10-16', false).notes).toBeUndefined();
  });

  it("refuses another day's script unless allowed", () => {
    const path = earlierRun(script);
    expect(() => loadResume(config, path, '2026-10-19', false)).toThrow('the script is for 2026-10-16, today is 2026-10-19. Set SC_RESUME_ALLOW_OTHER_DATE=true');
    expect(loadResume(config, path, '2026-10-19', true).script.date).toBe('2026-10-16');
  });

  it('refuses a script.json from before resume support', () => {
    const { date, stories, weekday, segment, targetMinutes, ...old } = script;
    expect(() => loadResume(config, earlierRun(old), '2026-10-16', false)).toThrow(/not a resumable script\.json \(problems in: date, weekday, segment, targetMinutes, stories\)/);
  });

  it('refuses a script without the fixed opening and closing, or with unknown speakers', () => {
    const broken = { ...script, sections: [{ id: 'headlines', title: 'H', lines: [{ speaker: 'Narrator', text: 'Hi.' }] }] };
    expect(() => loadResume(config, earlierRun(broken), '2026-10-16', false)).toThrow(
      "can't be voiced as is: the first section is not the fixed opening; the last section is not the fixed closing; unknown speakers Narrator",
    );
  });

  it('refuses a missing file', () => {
    expect(() => loadResume(config, '/nonexistent/script.json', '2026-10-16', false)).toThrow('does not exist');
  });

  it('says so in the run summary', () => {
    const md = summaryMarkdown({ ...emptyRun(), date: '2026-10-16', dryRun: true, resumedFrom: 'prev/script.json' }, []);
    expect(md).toContain('# Signal Check run: dry run done');
    expect(md).toContain('- Voice-only rerun of prev/script.json');
  });
});
