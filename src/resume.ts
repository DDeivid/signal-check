/**
 * script.json: the finished, reviewed content of an episode, with everything needed to voice it again
 * later (SC_RESUME_SCRIPT) without feeds, selection, research, writing or review.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Config } from './config';
import { lineSchema } from './script';

const storySchema = z.object({ title: z.string(), url: z.string(), topic: z.string(), summary: z.string() });
const gradeSchema = z.object({
  text: z.string(),
  by: z.string(),
  episode: z.number().int(),
  verdict: z.enum(['right', 'wrong', 'too_early']),
  evidence: z.string(),
  attempt: z.number().int().optional(),
});

export const savedScriptSchema = z.object({
  date: z.string().regex(/^\d{4}-\d\d-\d\d$/),
  weekday: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
  segment: z.enum(['look_back', 'deep_dive', 'far_field', 'markets', 'prediction_check']),
  targetMinutes: z.number().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  /** The full running order as voiced, fixed opening and closing included. */
  sections: z.array(z.object({ id: z.string(), title: z.string(), lines: z.array(lineSchema).min(1) })).min(1),
  stories: z.array(storySchema),
  predictions: z.array(z.object({ text: z.string(), by: z.string() })),
  open_threads: z.array(z.string()),
  story_summaries: z.array(z.object({ id: z.string(), summary: z.string() })).default([]),
  predictionGrades: z.array(gradeSchema).optional(),
  /** Models that researched, wrote and checked the script (voices are added when it's voiced). */
  textModels: z.array(z.object({ role: z.string(), models: z.array(z.string()) })).default([]),
});
export type SavedScript = z.infer<typeof savedScriptSchema>;

export interface Resumed {
  script: SavedScript;
  /** notes.md from the same folder as the script, if it was there. */
  notes?: string;
}

/**
 * Reads and checks a script.json from an earlier run, plus the notes.md next to it.
 * Refuses a script for another day unless `allowOtherDate`, and one whose structure can't be voiced as is.
 */
export function loadResume(config: Config, path: string, today: string, allowOtherDate: boolean): Resumed {
  if (!existsSync(path)) throw new Error(`SC_RESUME_SCRIPT: ${path} does not exist`);
  const parsed = savedScriptSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))].slice(0, 8).join(', ');
    throw new Error(`SC_RESUME_SCRIPT: ${path} is not a resumable script.json (problems in: ${fields}). Scripts written before resume support lack date and stories.`);
  }
  const script = parsed.data;
  if (script.date !== today && !allowOtherDate) {
    throw new Error(`SC_RESUME_SCRIPT: the script is for ${script.date}, today is ${today}. Set SC_RESUME_ALLOW_OTHER_DATE=true to voice it anyway.`);
  }
  const problems = resumeProblems(config, script);
  if (problems.length) throw new Error(`SC_RESUME_SCRIPT: ${path} can't be voiced as is: ${problems.join('; ')}`);
  const notesPath = join(dirname(path), 'notes.md');
  return { script, notes: existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : undefined };
}

/** Structural checks: opening and closing present, only the configured hosts speak. */
export function resumeProblems(config: Config, script: SavedScript): string[] {
  const problems: string[] = [];
  const ids = script.sections.map((s) => s.id);
  if (ids[0] !== 'opening') problems.push('the first section is not the fixed opening');
  if (ids.at(-1) !== 'closing') problems.push('the last section is not the fixed closing');
  const hosts = new Set(config.hosts.map((h) => h.name));
  const strangers = [...new Set(script.sections.flatMap((s) => s.lines.map((l) => l.speaker)).filter((s) => !hosts.has(s)))];
  if (strangers.length) problems.push(`unknown speakers ${strangers.join(', ')}`);
  return problems;
}
