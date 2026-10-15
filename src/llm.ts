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

function retryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
  return err instanceof TypeError || (err as Error)?.name === 'TimeoutError';
}

/** Seconds the API asked us to wait, if it said so. */
function retryDelay(err: unknown): number | undefined {
  const match = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(String((err as Error)?.message));
  return match ? Number(match[1]) : undefined;
}

/** Retries rate limits and server errors with backoff. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (err) {
      if (n >= attempts || !retryable(err)) throw err;
      const seconds = Math.min(retryDelay(err) ?? 10 * 2 ** (n - 1), 120);
      console.warn(`[${label}] attempt ${n} failed (${(err as Error).message.slice(0, 160)}); retrying in ${seconds}s`);
      await sleep(seconds * 1000);
    }
  }
}

async function callGemini(config: Config, opts: CallOptions, json: boolean): Promise<TextResult> {
  const response = await gemini().models.generateContent({
    model: config.llm.model,
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
    return await withRetry(opts.label, () => callGemini(config, opts, json));
  } catch (err) {
    if (!config.llm.fallback_model || !process.env.OPENROUTER_API_KEY) throw err;
    console.warn(`[${opts.label}] Gemini failed, using OpenRouter fallback: ${(err as Error).message.slice(0, 200)}`);
    return withRetry(`${opts.label}/fallback`, () => callOpenRouter(config, { ...opts, grounding: false }, json));
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
