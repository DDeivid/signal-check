/** out/summary.md: what a run did, built up as it goes, so a failed run can be read without the full log. */
import type { ModelUse } from './llm';
import { formatIssues, type ReviewRound } from './stages/review';
import type { ChunkReport } from './tts';

export interface RunInfo {
  date?: string;
  weekday?: string;
  segment?: string;
  minutes?: number;
  targetWords?: number;
  dryRun?: boolean;
  /** SC_RESUME_SCRIPT: the script.json this run voices instead of writing a new one. */
  resumedFrom?: string;
  skipped?: boolean;
  window?: { from: string; to: string; items: number };
  failedFeeds: string[];
  stories: Array<{ role: string; id: string; title: string }>;
  rounds: ReviewRound[];
  chosenRound?: number;
  tts: ChunkReport[];
  ttsModel?: string;
  file?: string;
  durationSeconds?: number;
  /** Episode image: model and theme colour, "failed" or "off". */
  art?: string;
  failure?: { stage: string; message: string };
}

export const emptyRun = (): RunInfo => ({ failedFeeds: [], stories: [], rounds: [], tts: [] });

const cell = (s: string | number) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (head: string[], rows: Array<Array<string | number>>) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

/** "research:s3" and "tts:2@model" both belong to their stage ("research", "tts"). */
const stageOf = (label: string) => label.split(/[:@/]/)[0]!;

function modelSection(uses: readonly ModelUse[]): string {
  if (!uses.length) return '';
  const stages = [...new Set(uses.map((u) => stageOf(u.label)))];
  const rows = stages.map((stage) => {
    const calls = uses.filter((u) => stageOf(u.label) === stage);
    return [stage, calls.length, [...new Set(calls.map((c) => c.model))].join(', ')];
  });
  const fallbacks = uses.filter((u) => u.fallbacks.length).map((u) => `- ${u.label}: ${u.fallbacks.join(' → ')} → ${u.model}`);
  return [`## Models\n${table(['Stage', 'Calls', 'Model'], rows)}`, fallbacks.length ? `Fallbacks hit:\n${fallbacks.join('\n')}` : 'No fallbacks needed.'].join('\n\n');
}

function ttsSection(run: RunInfo): string {
  if (!run.tts.length) return '';
  const rows = run.tts.map((c) => [c.index, c.words, c.chars, c.seconds, c.ratio, c.model, c.finishReason, c.problems?.join('; ') ?? 'ok']);
  return `## TTS${run.ttsModel ? ` (${run.ttsModel})` : ''}\n${table(['Chunk', 'Words', 'Chars', 'Seconds', 'Ratio', 'Model', 'Finish', 'Check'], rows)}`;
}

export function summaryMarkdown(run: RunInfo, uses: readonly ModelUse[]): string {
  const status = run.failure
    ? `FAILED in ${run.failure.stage}`
    : run.skipped
      ? 'skipped (already published)'
      : run.durationSeconds
        ? 'episode ready'
        : run.dryRun && (run.rounds.length || run.resumedFrom)
          ? 'dry run done'
          : 'in progress';
  const facts = [
    `- Date: ${run.date ?? '?'}`,
    run.weekday ? `- Format: ${run.weekday} (${run.segment})${run.dryRun ? ', dry run' : ''}` : '',
    run.resumedFrom ? `- Voice-only rerun of ${run.resumedFrom} (no feeds, selection, research, writing or review)` : '',
    run.minutes ? `- Target: ${run.minutes} min (${run.targetWords} words)` : '',
    run.window ? `- News window: ${run.window.from} → ${run.window.to}, ${run.window.items} items` : '',
    run.window ? `- Failed feeds: ${run.failedFeeds.length ? run.failedFeeds.join(', ') : 'none'}` : '',
    run.durationSeconds ? `- Final duration: ${run.durationSeconds}s (${(run.durationSeconds / 60).toFixed(1)} min)${run.file ? `, ${run.file}` : ''}` : '',
    run.art ? `- Image: ${run.art}` : '',
  ].filter(Boolean);
  const stories = run.stories.length ? `## Stories\n${run.stories.map((s) => `- ${s.role}: ${s.title} (${s.id})`).join('\n')}` : '';
  const rounds = run.rounds.length
    ? `## Review\n${run.rounds
        .map((r) => `### Round ${r.round}${r.error ? ' (failed)' : ` (${r.words} words)`}${r.round === run.chosenRound ? ', kept' : ''}\n${r.issues.length ? formatIssues(r.issues) : 'No issues.'}`)
        .join('\n\n')}`
    : '';
  const failure = run.failure ? `## Failure\nStage: ${run.failure.stage}\n\n\`\`\`\n${run.failure.message}\n\`\`\`` : '';
  return [`# Signal Check run: ${status}`, facts.join('\n'), failure, stories, modelSection(uses), rounds, ttsSection(run)].filter(Boolean).join('\n\n') + '\n';
}
