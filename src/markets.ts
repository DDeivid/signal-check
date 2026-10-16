import { readFileSync } from 'node:fs';
import type { Config } from './config';

export interface Quote {
  label: string;
  symbol: string;
  currency: string;
  date: string;
  close: number;
  dayChangePct: number | null;
  weekChangePct: number | null;
}

interface ChartResponse {
  chart: {
    result?: Array<{
      meta: {
        currency?: string;
        exchangeTimezoneName?: string;
        regularMarketTime?: number;
        currentTradingPeriod?: { regular?: { start?: number; end?: number } };
      };
      timestamp?: number[];
      indicators: { quote: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { description?: string } | null;
  };
}

const pct = (from: number | undefined, to: number) => (from ? ((to - from) / from) * 100 : null);

const dayIn = (seconds: number, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(seconds * 1000));

/**
 * Daily closes → latest close, day change and change vs five sessions back.
 *
 * Unfinished bars: at the early-morning run, Yahoo's daily series ends with today's still-running bar for
 * 24-hour instruments (Bitcoin, EUR/USD, gold, Brent). Rule: the last bar is dropped when its date in the
 * exchange's time zone is today's date there and the regular session hasn't ended yet
 * (`now` before meta.currentTradingPeriod.regular.end). Without a trading period in the response, a bar
 * dated today is always dropped. So the table only ever shows finished sessions: "latest close".
 */
export function parseChart(label: string, symbol: string, body: ChartResponse, now = new Date()): Quote {
  const result = body.chart.result?.[0];
  if (!result) throw new Error(body.chart.error?.description ?? 'empty chart response');
  const closes = result.indicators.quote[0]?.close ?? [];
  const tz = result.meta.exchangeTimezoneName ?? 'UTC';
  const points = (result.timestamp ?? [])
    .map((t, n) => ({ t, close: closes[n] }))
    .filter((p): p is { t: number; close: number } => typeof p.close === 'number');
  const nowSeconds = now.getTime() / 1000;
  const sessionEnd = result.meta.currentTradingPeriod?.regular?.end;
  const latest = points.at(-1);
  if (latest && dayIn(latest.t, tz) === dayIn(nowSeconds, tz) && (sessionEnd === undefined || nowSeconds < sessionEnd)) points.pop();
  const last = points.at(-1);
  if (!last) throw new Error('no finished sessions');
  return {
    label,
    symbol,
    currency: result.meta.currency ?? '',
    date: dayIn(last.t, tz),
    close: last.close,
    dayChangePct: pct(points.at(-2)?.close, last.close),
    weekChangePct: points.length > 5 ? pct(points.at(-6)?.close, last.close) : null,
  };
}

export async function fetchQuotes(config: Config): Promise<{ quotes: Quote[]; failures: string[] }> {
  // Rehearsals: a fixed market table instead of Yahoo.
  const fixture = process.env.SC_FIXTURE_MARKETS;
  if (fixture) return { quotes: JSON.parse(readFileSync(fixture, 'utf8')) as Quote[], failures: [] };
  const quotes: Quote[] = [];
  const failures: string[] = [];
  for (const { label, symbol } of config.markets.instruments) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      quotes.push(parseChart(label, symbol, (await res.json()) as ChartResponse));
    } catch (err) {
      failures.push(`${label} (${symbol}): ${(err as Error).message}`);
    }
  }
  return { quotes, failures };
}

const round = (n: number, digits: number) => n.toFixed(digits);

/** Plain-text table handed to the writer and the fact-checker. The only source of numbers. */
export function quotesTable(quotes: Quote[]): string {
  return quotes
    .map((q) => {
      const digits = q.close < 10 ? 4 : 2;
      const day = q.dayChangePct === null ? 'n/a' : `${round(q.dayChangePct, 2)}%`;
      const week = q.weekChangePct === null ? 'n/a' : `${round(q.weekChangePct, 2)}%`;
      return `${q.label}: latest close ${round(q.close, digits)} ${q.currency} on ${q.date}; day ${day}; 5 sessions ${week}`;
    })
    .join('\n');
}
