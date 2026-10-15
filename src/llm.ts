import { ApiError, GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import type { Config } from './config';

export interface Source {
  title: string;
  url: string;
}

export interface TextResult {
  text: string;
  sources: Source[];
}

export interface CallOptions {
  label: string;
  system: string;
  prompt: string;
  temperature?: number;
  grounding?: boolean;
}

let client: GoogleGenAI | undefined;
let lastCall = 0;

export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(seconds: number): Promise<void> {
  const wait = lastCall + seconds * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

/** What to do after a failed call: wait and retry the same model, move to the next model, or give up. */
export function classify(err: unknown): 'retry' | 'next-model' | 'fatal' {
  if (err instanceof ApiError) {
    const message = err.message;
    if (err.status === 429) return /limit: 0\b|PerDay|per day/i.test(message) ? 'next-model' : 'retry';
    if (err.status >= 500) return 'retry';
    if (err.status === 404 || (err.status === 400 && /not (found|supported)/i.test(message))) return 'next-model';
    return 'fatal';
  }
  return err instanceof TypeError || (err as Error)?.name === 'TimeoutError' ? 'retry' : 'fatal';
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

/**
 * Try each model in order. A busy or rate-limited model gets a few quick retries before
 * the next one is tried; a model without quota or that doesn't exist is skipped at once.
 */
export async function withModels<T>(label: string, models: string[], fn: (model: string) => Promise<T>, attemptsPerModel = 3): Promise<T> {
  let last: unknown;
  for (const model of models) {
    try {
      return await withRetry(`${label}@${model}`, () => fn(model), attemptsPerModel);
    } catch (err) {
      if (classify(err) === 'fatal') throw err;
      last = err;
      console.warn(`[${label}] ${model} unavailable (${describeError(err)})`);
    }
  }
  throw last;
}

async function callGemini(config: Config, model: string, opts: CallOptions, json: boolean): Promise<TextResult> {
  const response = await gemini().models.generateContent({
    model,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      temperature: opts.temperature ?? config.llm.temperature,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(opts.grounding ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });
  const text = response.text;
  if (!text) throw new Error(`empty response (finish reason: ${response.candidates?.[0]?.finishReason ?? 'unknown'})`);
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? c.web.uri, url: c.web.uri }] : []));
  return { text, sources };
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
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned no content');
  return { text, sources: [] };
}

async function call(config: Config, opts: CallOptions, json: boolean): Promise<TextResult> {
  await throttle(config.llm.min_seconds_between_calls);
  try {
    return await withModels(opts.label, config.llm.models, (model) => callGemini(config, model, opts, json));
  } catch (err) {
    if (opts.grounding || !config.llm.fallback_model || !process.env.OPENROUTER_API_KEY) throw err;
    console.warn(`[${opts.label}] Gemini failed, using OpenRouter fallback: ${describeError(err)}`);
    return withRetry(`${opts.label}/fallback`, () => callOpenRouter(config, opts, json));
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
