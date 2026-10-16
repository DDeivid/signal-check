import { ApiError, FinishReason, GenerateContentResponse } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import {
  type AiClient,
  classify,
  generateText,
  isDemoted,
  ModelOutputError,
  modelUses,
  NoModelAvailableError,
  noteFailure,
  OpenRouterError,
  RequestTimeoutError,
  resetModelState,
  responseText,
  setAiClient,
  withModels,
  withTimeout,
  failureHint,
} from '../src/llm';

const config = loadConfig();
const fast = { ...config, llm: { ...config.llm, min_seconds_between_calls: 0, fallback_model: '' } };
const apiError = (status: number, message: string) => new ApiError({ status, message });
const DAILY = '{"error":{"code":429,"details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}';

function response(text: string | undefined, finishReason: FinishReason = FinishReason.STOP): GenerateContentResponse {
  const r = new GenerateContentResponse();
  r.candidates = [{ content: { role: 'model', parts: text === undefined ? [] : [{ text }] }, finishReason }];
  return r;
}

beforeEach(() => resetModelState());
afterEach(() => setAiClient(undefined));

describe('classification', () => {
  it('retries timeouts and OpenRouter rate limits and server errors', () => {
    expect(classify(new RequestTimeoutError('slow'))).toBe('retry');
    expect(classify(new DOMException('The operation timed out.', 'TimeoutError'))).toBe('retry');
    expect(classify(new DOMException('This operation was aborted', 'AbortError'))).toBe('retry');
    expect(classify(new OpenRouterError(429, 'OpenRouter HTTP 429'))).toBe('retry');
    expect(classify(new OpenRouterError(502, 'OpenRouter HTTP 502'))).toBe('retry');
    expect(classify(new OpenRouterError(401, 'OpenRouter HTTP 401'))).toBe('fatal');
  });

  it('moves to the next model on unusable output', () => {
    expect(classify(new ModelOutputError('empty'))).toBe('next-model');
    expect(classify(new NoModelAvailableError('all demoted'))).toBe('next-model');
  });

  it('still treats unknown plain errors as fatal', () => {
    expect(classify(new Error('boom'))).toBe('fatal');
  });
});

describe('response text', () => {
  it('returns normal text', () => {
    expect(responseText(response('{"a":1}'))).toBe('{"a":1}');
  });

  it('rejects empty, blocked and truncated responses as next-model errors', () => {
    for (const reason of [FinishReason.SAFETY, FinishReason.RECITATION, FinishReason.MAX_TOKENS]) {
      const err = (() => {
        try {
          responseText(response('partial', reason));
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(ModelOutputError);
      expect(classify(err)).toBe('next-model');
      expect((err as Error).message).toContain(reason);
    }
    expect(() => responseText(response(undefined))).toThrow(ModelOutputError);
    expect(() => responseText(response('   '))).toThrow('empty response');
  });

  it('falls through to the next model when one returns nothing', async () => {
    const tried: string[] = [];
    const client: AiClient = {
      async generateContent(_label, params) {
        tried.push(params.model);
        return params.model === config.llm.models[0] ? response('', FinishReason.SAFETY) : response('hello');
      },
    };
    setAiClient(client);
    const { text } = await generateText(fast, { label: 'research:s1', system: 's', prompt: 'p' });
    expect(text).toBe('hello');
    expect(tried).toEqual(config.llm.models.slice(0, 2));
    expect(modelUses().at(-1)).toMatchObject({ label: 'research:s1', model: config.llm.models[1] });
  });
});

describe('timeouts', () => {
  it('rejects with a retryable timeout and aborts the request', async () => {
    let aborted = false;
    const err = await withTimeout(20, (signal) => {
      signal.addEventListener('abort', () => (aborted = true));
      return new Promise(() => {});
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RequestTimeoutError);
    expect(classify(err)).toBe('retry');
    expect(aborted).toBe(true);
  });

  it('passes through a result that arrives in time', async () => {
    expect(await withTimeout(1000, async () => 'ok')).toBe('ok');
  });

  it('sends an abort signal to the Gemini call', async () => {
    let signal: AbortSignal | undefined;
    setAiClient({
      async generateContent(_label, params) {
        signal = params.config?.abortSignal;
        return response('fine');
      },
    });
    await generateText(fast, { label: 'write', system: 's', prompt: 'p' });
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe('model demotion', () => {
  it('skips a model with no daily quota for the rest of the run', async () => {
    const tried: string[] = [];
    const fn = async (model: string) => {
      tried.push(model);
      if (model === 'a') throw apiError(429, DAILY);
      return model;
    };
    expect(await withModels('t', ['a', 'b'], fn)).toBe('b');
    expect(await withModels('t', ['a', 'b'], fn)).toBe('b');
    expect(tried).toEqual(['a', 'b', 'b']);
    expect(isDemoted('a', Date.now() + 365 * 86_400_000)).toBe(true);
    expect(modelUses().at(-1)!.fallbacks).toEqual(['a (demoted)']);
  });

  it('also demotes on "limit: 0"', () => {
    noteFailure('x', apiError(429, 'Quota exceeded for metric: y, limit: 0, model: x'));
    expect(isDemoted('x')).toBe(true);
  });

  it('does not demote on an ordinary rate limit', () => {
    noteFailure('x', apiError(429, '{"retryDelay": "20s"}'));
    expect(isDemoted('x')).toBe(false);
  });

  it('pauses a model for 10 minutes after two exhausted 503 calls in a row', async () => {
    const now = Date.now();
    noteFailure('m', apiError(503, 'overloaded'), now);
    expect(isDemoted('m', now)).toBe(false);
    noteFailure('m', apiError(503, 'overloaded'), now);
    expect(isDemoted('m', now + 9 * 60_000)).toBe(true);
    expect(isDemoted('m', now + 11 * 60_000)).toBe(false);
  });

  it('resets the 503 streak after a success', async () => {
    let calls = 0;
    const fn = async (model: string) => {
      calls++;
      if (calls === 2) return model;
      throw apiError(503, 'overloaded');
    };
    await withModels('t', ['m', 'n'], fn, 1); // m fails (streak 1), n answers
    await withModels('t', ['m'], async (m) => m, 1); // m answers: streak reset
    noteFailure('m', apiError(503, 'overloaded'));
    expect(isDemoted('m')).toBe(false);
  });

  it('throws a next-model error when every model is demoted', async () => {
    noteFailure('a', apiError(429, DAILY));
    const err = await withModels('t', ['a'], async (m) => m).catch((e) => e);
    expect(err).toBeInstanceOf(NoModelAvailableError);
    expect(classify(err)).toBe('next-model');
  });
});

describe('failure hints', () => {
  it('explains empty prepaid credit and used-up free quota', () => {
    expect(failureHint('ApiError: {"error":{"code":402,"message":"Your prepayment credits are depleted."}}')).toMatch(/top it up in AI Studio/);
    expect(failureHint('[quota: GenerateRequestsPerDayPerProjectPerModel-FreeTier]')).toMatch(/resets at midnight Pacific/);
    expect(failureHint('something else')).toBe('');
  });
});
