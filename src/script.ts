import { z } from 'zod';

export const lineSchema = z.object({ speaker: z.string(), text: z.string().min(1) });
export type Line = z.infer<typeof lineSchema>;

export const SECTION_IDS = ['headlines', 'main_1', 'main_2', 'segment', 'quick_hits'] as const;

/** What the writer returns. Opening and closing lines are added in code, not by the model. */
export const draftSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  sections: z.array(
    z.object({
      id: z.enum(SECTION_IDS),
      title: z.string(),
      lines: z.array(lineSchema).min(1),
    }),
  ),
  predictions: z.array(z.object({ text: z.string(), by: z.string() })).default([]),
  open_threads: z.array(z.string()).default([]),
  story_summaries: z.array(z.object({ id: z.string(), summary: z.string() })).default([]),
});
export type Draft = z.infer<typeof draftSchema>;

export interface Section {
  id: string;
  title: string;
  lines: Line[];
}

export const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function sectionWords(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.lines.reduce((n, l) => n + words(l.text), 0), 0);
}

export function transcript(sections: Section[]): string {
  return sections
    .map((s) => [`## ${s.title}`, ...s.lines.map((l) => `**${l.speaker}:** ${l.text}`)].join('\n\n'))
    .join('\n\n');
}

/** Numbered lines so reviewers can point at them: "[12] Theo: ..." */
export function numberedScript(sections: Section[]): string {
  let n = 0;
  return sections
    .map((s) => [`# ${s.title}`, ...s.lines.map((l) => `[${++n}] ${l.speaker}: ${l.text}`)].join('\n'))
    .join('\n\n');
}

/**
 * Split lines into TTS requests of at most `maxChars`, breaking only between lines
 * and preferring section boundaries once a chunk is past half full.
 */
export function chunkForTts(sections: Section[], maxChars: number): Line[][] {
  const chunks: Line[][] = [];
  let current: Line[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
    size = 0;
  };
  for (const section of sections) {
    if (size > maxChars / 2) flush();
    for (const line of section.lines) {
      const len = line.speaker.length + line.text.length + 3;
      if (size + len > maxChars && current.length) flush();
      current.push(line);
      size += len;
    }
  }
  flush();
  return chunks;
}
