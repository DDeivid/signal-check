import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

const line = z.object({ speaker: z.string(), text: z.string() });
const weekday = z.object({
  segment: z.enum(['look_back', 'deep_dive', 'far_field', 'markets', 'prediction_check']),
  minutes: z.number().positive(),
});
const segment = z.object({ title: z.string(), brief: z.string() });

export const configSchema = z.object({
  show: z.object({
    title: z.string(),
    tagline: z.string(),
    description: z.string(),
    site_url: z.string().url(),
    language: z.string(),
    author: z.string(),
    owner_name: z.string(),
    owner_email: z.string(),
    categories: z.array(z.string()).min(1),
    explicit: z.boolean(),
    timezone: z.string(),
    opening: z.array(line),
    closing: z.array(line),
  }),
  hosts: z.array(z.object({ name: z.string(), voice: z.string(), persona: z.string() })).length(2),
  topics: z.object({
    core: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
    core_share: z.number().min(0).max(1),
  }),
  episode: z.object({
    words_per_minute: z.number().positive(),
    headlines: z.number().int().min(0),
    main_stories: z.number().int().min(1),
    quick_hits: z.number().int().min(0),
  }),
  schedule: z.object({
    window_cap_days: z.number().positive(),
    first_run_hours: z.number().positive(),
    weekdays: z.object({
      monday: weekday,
      tuesday: weekday,
      wednesday: weekday,
      thursday: weekday,
      friday: weekday,
    }),
  }),
  segments: z.object({
    look_back: segment,
    deep_dive: segment,
    far_field: segment,
    markets: segment,
    prediction_check: segment,
  }),
  feeds: z.array(z.object({ name: z.string(), url: z.string().url(), topic: z.string() })).min(1),
  markets: z.object({
    instruments: z.array(z.object({ label: z.string(), symbol: z.string() })),
  }),
  llm: z.object({
    models: z.array(z.string()).min(1),
    temperature: z.number(),
    min_seconds_between_calls: z.number().min(0),
    fallback_model: z.string(),
  }),
  research: z.object({ grounding: z.boolean(), article_chars: z.number().int().positive() }),
  quality: z.object({
    max_revisions: z.number().int().min(0),
    on_unresolved: z.enum(['stop', 'publish']),
    length_tolerance: z.number().positive(),
    max_line_words: z.number().int().positive(),
    banned_phrases: z.array(z.string()),
  }),
  tts: z.object({
    models: z.array(z.string()).min(1),
    max_chars_per_request: z.number().int().positive(),
    seconds_between_requests: z.number().min(0),
    style: z.string(),
  }),
  audio: z.object({
    bitrate: z.string(),
    gap_ms: z.number().int().min(0),
    intro: z.string(),
    outro: z.string(),
    length_warning_tolerance: z.number().positive(),
  }),
});

export type Config = z.infer<typeof configSchema>;
export type SegmentId = Config['schedule']['weekdays']['monday']['segment'];
export type Weekday = keyof Config['schedule']['weekdays'];

export function loadConfig(path = process.env.SC_CONFIG ?? 'podcast.config.yaml'): Config {
  const result = configSchema.safeParse(parse(readFileSync(path, 'utf8')));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid ${path}:\n${issues}`);
  }
  const config = result.data;
  const names = config.hosts.map((h) => h.name);
  for (const l of [...config.show.opening, ...config.show.closing]) {
    if (!names.includes(l.speaker)) throw new Error(`Unknown speaker "${l.speaker}" in show.opening/closing`);
  }
  return config;
}

export function isCoreTopic(config: Config, topic: string): boolean {
  return config.topics.core.some((t) => t.id === topic);
}
