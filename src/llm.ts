import { ApiError, type GenerateContentParameters, type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import type { Config } from './config';
import { fakeAiClient } from './fake-ai';

export interface Source {
  title: string;
  url: string;
}

export interface TextResult {
  text: string;
  sources: Source[];
  /** The exact model version Gemini reports. */
  modelVersion?: string;
}

export interface CallOptions {
  label: string;
  system: string;
  prompt: string;
  temperature?: number;
  grounding?: boolean;
}

/** The one Gemini call this project makes. The label names the stage, so a fake client can answer per stage. */
export interface AiClient {
  generateContent(label: string, params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

export const TEXT_TIMEOUT_MS = 120_000;
export const TTS_TIMEOUT_MS = 180_000;

/** The model answered, but with nothing usable (empty, blocked or cut off). Another model may do better. */
export class ModelOutputError extends Error {
  override name = 'ModelOutputError';
}

/** A request that took longer than its timeout. Worth retrying. */
export class RequestTimeoutError extends Error {
  override name = 'RequestTimeoutError';
}

export class OpenRouterError extends Error {
  override name = 'OpenRouterError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Every model in the list is demoted or was skipped. Lets the caller move on as with any other unavailable model. */
export class NoModelAvailableError extends Error {
  override name = 'NoModelAvailableError';
}

/** Errors that carry their own classification (TTS output and audio QA problems). */
export interface ClassifiedError extends Error {
  action: 'retry' | 'next-model' | 'fatal';
}

const isClassified = (err: unknown): err is ClassifiedError =>
  err instanceof Error && ['retry', 'next-model', 'fatal'].includes((err as ClassifiedError).action);

let client: GoogleGenAI | undefined;
let aiOverride: AiClient | undefined;
let lastCall = 0;

export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** The client for generation calls: the real Gemini API, or the deterministic fake with SC_FAKE_AI=true. */
export function ai(): AiClient {
  if (aiOverride) return aiOverride;
  if (process.env.SC_FAKE_AI === 'true') return (aiOverride = fakeAiClient());
  return { generateContent: (_label, params) => gemini().models.generateContent(params) };
}

/** For tests: use this client instead (undefined goes back to the default). */
export function setAiClient(next: AiClient | undefined): void {
  aiOverride = next;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(seconds: number): Promise<void> {
  const wait = lastCall + seconds * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

/** Runs `fn` with an abort signal and rejects with RequestTimeoutError after `ms`, whatever the SDK does with the signal. */
export async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError(`request timed out after ${ms / 1000}s`));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const DAILY_QUOTA = /limit: 0\b|PerDay|per day/i;

export const isDailyQuota = (err: unknown) => err instanceof ApiError && err.status === 429 && DAILY_QUOTA.test(err.message);

/** What to do after a failed call: wait and retry the same model, move to the next model, or give up. */
export function classify(err: unknown): 'retry' | 'next-model' | 'fatal' {
  if (isClassified(err)) return err.action;
  if (err instanceof ApiError) {
    const message = err.message;
    if (err.status === 429) return DAILY_QUOTA.test(message) ? 'next-model' : 'retry';
    if (err.status >= 500) return 'retry';
    if (err.status === 404 || (err.status === 400 && /not (found|supported)/i.test(message))) return 'next-model';
    return 'fatal';
  }
  if (err instanceof ModelOutputError || err instanceof NoModelAvailableError) return 'next-model';
  if (err instanceof RequestTimeoutError) return 'retry';
  if (err instanceof OpenRouterError) return err.status === 429 || err.status >= 500 ? 'retry' : 'fatal';
  const name = (err as Error)?.name;
  return err instanceof TypeError || name === 'TimeoutError' || name === 'AbortError' ? 'retry' : 'fatal';
}

/** Seconds the API asked us to wait, if it said so. */
function retryDelay(err: unknown): number | undefined {
  const match = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(String((err as Error)?.message));
  return match ? Number(match[1]) : undefined;
}

/** The useful part of an API error: status, message and the quota that ran out, if any. */
export function describeError(err: unknown): string {
  const message = String((err as Error)?.message ?? err);
  const short = /"message"\s*:\s*"([^"]{0,200})/.exec(message)?.[1] ?? message.slice(0, 200);
  const quota = [...message.matchAll(/"quotaId"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const status = err instanceof ApiError ? `${err.status} ` : '';
  return `${status}${short}${quota.length ? ` [quota: ${[...new Set(quota)].join(', ')}]` : ''}`;
}

/** Retries rate limits and server errors with backoff. Errors that won't go away by waiting are thrown at once. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (err) {
      if (n >= attempts || classify(err) !== 'retry') throw err;
      const seconds = Math.min(retryDelay(err) ?? 10 * 2 ** (n - 1), 90);
      console.warn(`[${label}] attempt ${n} failed (${describeError(err)}); retrying in ${seconds}s`);
      await sleep(seconds * 1000);
    }
  }
}

// Models that are out of daily quota (for the whole run) or keep returning 503 (for a while).
const OVERLOAD_PAUSE_MS = 10 * 60_000;
const demotedUntil = new Map<string, number>();
const overloadStreak = new Map<string, number>();

export function isDemoted(model: string, now = Date.now()): boolean {
  return (demotedUntil.get(model) ?? 0) > now;
}

/** Remember what a failed model told us, so later calls in this run don't waste time on it. */
export function noteFailure(model: string, err: unknown, now = Date.now()): void {
  if (isDailyQuota(err)) {
    demotedUntil.set(model, Infinity);
    console.warn(`[models] ${model} is out of daily quota; skipping it for the rest of the run`);
    return;
  }
  if (err instanceof ApiError && err.status === 503) {
    const streak = (overloadStreak.get(model) ?? 0) + 1;
    overloadStreak.set(model, streak);
    if (streak >= 2) {
      demotedUntil.set(model, now + OVERLOAD_PAUSE_MS);
      overloadStreak.set(model, 0);
      console.warn(`[models] ${model} overloaded twice in a row; skipping it for 10 minutes`);
    }
  }
}

function noteSuccess(model: string): void {
  overloadStreak.delete(model);
}

/** One entry per call: which model answered, and what was tried first. Read by the run summary. */
export interface ModelUse {
  label: string;
  model: string;
  /** The exact model that answered, when the API says (an alias like gemini-flash-latest doesn't). */
  version?: string;
  fallbacks: string[];
}

const uses: ModelUse[] = [];
export const modelUses = (): readonly ModelUse[] => uses;

/** For tests: forget demotions and the model log. */
export function resetModelState(): void {
  demotedUntil.clear();
  overloadStreak.clear();
  uses.length = 0;
}

/**
 * Try each model in order. A busy or rate-limited model gets a few quick retries before
 * the next one is tried; a model without quota or that doesn't exist is skipped at once.
 */
export async function withModels<T>(label: string, models: string[], fn: (model: string) => Promise<T>, attemptsPerModel = 3): Promise<T> {
  const { result } = await withModelsNamed(label, models, fn, attemptsPerModel);
  return result;
}

/** withModels, also returning the model that answered. */
export async function withModelsNamed<T>(
  label: string,
  models: string[],
  fn: (model: string) => Promise<T>,
  attemptsPerModel = 3,
): Promise<{ result: T; model: string }> {
  let last: unknown;
  const fallbacks: string[] = [];
  for (const model of models) {
    if (isDemoted(model)) {
      fallbacks.push(`${model} (demoted)`);
      continue;
    }
    try {
      const result = await withRetry(`${label}@${model}`, () => fn(model), attemptsPerModel);
      noteSuccess(model);
      const version = (result as { modelVersion?: unknown } | null)?.modelVersion;
      uses.push({ label, model, fallbacks, ...(typeof version === 'string' && version ? { version } : {}) });
      return { result, model };
    } catch (err) {
      noteFailure(model, err);
      if (classify(err) === 'fatal') {
        uses.push({ label, model: `${model} (failed)`, fallbacks });
        throw err;
      }
      last = err;
      fallbacks.push(`${model} (${describeError(err).slice(0, 80)})`);
      console.warn(`[${label}] ${model} unavailable (${describeError(err)})`);
    }
  }
  uses.push({ label, model: '(none)', fallbacks });
  throw last ?? new NoModelAvailableError(`[${label}] no usable model: ${fallbacks.join(', ') || 'none configured'}`);
}

const BAD_FINISH = new Set(['SAFETY', 'RECITATION', 'MAX_TOKENS']);

/** The text of a response, or a ModelOutputError if it's empty, blocked or truncated. */
export function responseText(response: GenerateContentResponse): string {
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && BAD_FINISH.has(finish)) throw new ModelOutputError(`response stopped early (finish reason: ${finish})`);
  const text = response.text;
  if (!text?.trim()) throw new ModelOutputError(`empty response (finish reason: ${finish ?? 'unknown'})`);
  return text;
}

async function callGemini(config: Config, model: string, opts: CallOptions, json: boolean): Promise<TextResult> {
  const response = await withTimeout(TEXT_TIMEOUT_MS, (abortSignal) =>
    ai().generateContent(opts.label, {
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? config.llm.temperature,
        abortSignal,
        ...(json ? { responseMimeType: 'application/json' } : {}),
        ...(opts.grounding ? { tools: [{ googleSearch: {} }] } : {}),
      },
    }),
  );
  const text = responseText(response);
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? c.web.uri, url: c.web.uri }] : []));
  return { text, sources, ...(response.modelVersion ? { modelVersion: response.modelVersion } : {}) };
}

async function callOpenRouter(config: Config, opts: CallOptions, json: boolean): Promise<TextResult> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.llm.fallback_model,
      temperature: opts.temperature ?? config.llm.temperature,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
  });
  if (!res.ok) throw new OpenRouterError(res.status, `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new ModelOutputError('OpenRouter returned no content');
  return { text, sources: [] };
}

async function call(config: Config, opts: CallOptions, json: boolean): Promise<TextResult> {
  await throttle(config.llm.min_seconds_between_calls);
  try {
    return await withModels(opts.label, config.llm.models, (model) => callGemini(config, model, opts, json));
  } catch (err) {
    if (opts.grounding || !config.llm.fallback_model || !process.env.OPENROUTER_API_KEY) throw err;
    console.warn(`[${opts.label}] Gemini failed, using OpenRouter fallback: ${describeError(err)}`);
    const result = await withRetry(`${opts.label}/fallback`, () => callOpenRouter(config, opts, json));
    uses.push({ label: opts.label, model: `openrouter:${config.llm.fallback_model}`, fallbacks: [...config.llm.models] });
    return result;
  }
}

export async function generateText(config: Config, opts: CallOptions): Promise<TextResult> {
  return call(config, opts, false);
}

export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('no JSON found in model output');
  return JSON.parse(body.slice(start, end + 1));
}

/** JSON call validated by a zod schema. One repair attempt if the output doesn't validate. */
export async function generateJson<T>(config: Config, opts: CallOptions, schema: z.ZodType<T>): Promise<T> {
  let prompt = opts.prompt;
  for (let attempt = 1; ; attempt++) {
    const { text } = await call(config, { ...opts, prompt, grounding: false }, true);
    try {
      return schema.parse(extractJson(text));
    } catch (err) {
      if (attempt >= 2) throw new Error(`[${opts.label}] invalid JSON from model: ${(err as Error).message.slice(0, 500)}`);
      console.warn(`[${opts.label}] output did not validate, asking again`);
      prompt = `${opts.prompt}\n\nYour previous answer was invalid: ${(err as Error).message.slice(0, 800)}\nReturn only valid JSON in the required shape.`;
    }
  }
}
