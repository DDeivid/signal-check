import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { buildFeed, hms, markdownToHtml } from '../src/feed';
import { normalizeUrl, prepareItems } from '../src/feeds';
import type { EpisodeRecord } from '../src/history';
import { ApiError } from '@google/genai';
import { classify, describeError, extractJson, withModels } from '../src/llm';
import { parseChart, quotesTable, type Quote } from '../src/markets';
import { chunkForTts, type Section } from '../src/script';
import { htmlToText } from '../src/stages/research';
import { assembleSections, ruleIssues, unmatchedMarketNumbers } from '../src/stages/review';
import { outsideShare, validateSelection } from '../src/stages/select';
import { wordBudget } from '../src/stages/write';
import { localDate, showWeekday, windowStart } from '../src/time';
import { pcmToWav } from '../src/wav';

const config = loadConfig();
const DAY = 86_400_000;

describe('config', () => {
  it('loads the real podcast.config.yaml', () => {
    expect(config.hosts.map((h) => h.name)).toEqual(['Mia', 'Theo']);
    expect(config.feeds.length).toBeGreaterThan(10);
  });
});

describe('time', () => {
  const now = new Date('2026-10-19T05:00:00Z'); // Monday 08:00 in Tallinn

  it('uses the Tallinn calendar day and weekday', () => {
    expect(localDate(new Date('2026-10-15T22:30:00Z'), 'Europe/Tallinn')).toBe('2026-10-16');
    expect(showWeekday(now, 'Europe/Tallinn')).toBe('monday');
    expect(showWeekday(now, 'Europe/Tallinn', 'thursday')).toBe('thursday');
    expect(showWeekday(new Date('2026-10-18T05:00:00Z'), 'Europe/Tallinn')).toBe('monday');
  });

  it('starts the window at the last episode, capped', () => {
    const friday = new Date(now.getTime() - 3 * DAY);
    expect(windowStart(now, friday, 4, 30)).toEqual(friday);
    expect(windowStart(now, new Date(now.getTime() - 9 * DAY), 4, 30)).toEqual(new Date(now.getTime() - 4 * DAY));
    expect(windowStart(now, undefined, 4, 30)).toEqual(new Date(now.getTime() - 30 * 3_600_000));
  });
});

describe('feeds', () => {
  const now = new Date('2026-10-15T05:00:00Z');
  const item = (title: string, url: string, hoursAgo: number) => ({
    feed: 'F', topic: 'world', title, url, published: new Date(now.getTime() - hoursAgo * 3_600_000), snippet: '',
  });

  it('normalises URLs', () => {
    expect(normalizeUrl('https://www.example.com/a/?utm_source=x#top')).toBe('example.com/a');
  });

  it('filters the window, dedupes and skips covered stories', () => {
    const items = prepareItems(
      [
        item('Old', 'https://a.com/old', 100),
        item('Story', 'https://a.com/1', 2),
        item('Story', 'https://b.com/other', 3),
        item('Covered', 'https://a.com/2?utm_medium=rss', 4),
        item('Fresh', 'https://a.com/3', 1),
      ],
      new Date(now.getTime() - 24 * 3_600_000),
      now,
      new Set(['a.com/2']),
    );
    expect(items.map((i) => [i.id, i.title])).toEqual([['s1', 'Fresh'], ['s2', 'Story']]);
  });
});

describe('markets', () => {
  const chart = {
    chart: {
      result: [{
        meta: { currency: 'USD', exchangeTimezoneName: 'America/New_York' },
        timestamp: [1, 2, 3, 4, 5, 6].map((d) => Date.UTC(2026, 9, 8 + d, 20) / 1000),
        indicators: { quote: [{ close: [100, 101, null, 102, 103, 110] }] },
      }],
    },
  };

  it('parses closes and changes', () => {
    const q = parseChart('Test', 'T', chart, new Date('2026-10-20T05:00:00Z'));
    expect(q.close).toBe(110);
    expect(q.dayChangePct).toBeCloseTo(6.796, 2);
    expect(q.weekChangePct).toBeNull();
    expect(quotesTable([q])).toContain('Test: latest close 110.00 USD on 2026-10-14');
  });

  describe('unfinished bars', () => {
    // A 24-hour instrument at 05:00 UTC: the series ends with today's running bar.
    const btc = (end?: number) => ({
      chart: {
        result: [{
          meta: { currency: 'USD', exchangeTimezoneName: 'UTC', ...(end ? { currentTradingPeriod: { regular: { start: Date.UTC(2026, 9, 16) / 1000, end } } } : {}) },
          timestamp: [Date.UTC(2026, 9, 14) / 1000, Date.UTC(2026, 9, 15) / 1000, Date.UTC(2026, 9, 16) / 1000],
          indicators: { quote: [{ close: [60_000, 61_000, 62_500] }] },
        }],
      },
    });
    const morning = new Date('2026-10-16T05:00:00Z');

    it("drops today's bar while the session is still open", () => {
      const q = parseChart('Bitcoin', 'BTC-USD', btc(Date.UTC(2026, 9, 16, 23, 59) / 1000), morning);
      expect(q).toMatchObject({ close: 61_000, date: '2026-10-15' });
    });

    it('drops a bar dated today when the response has no trading period', () => {
      expect(parseChart('Bitcoin', 'BTC-USD', btc(), morning).date).toBe('2026-10-15');
    });

    it("keeps today's bar once the session has ended", () => {
      const q = parseChart('Bitcoin', 'BTC-USD', btc(Date.UTC(2026, 9, 16, 4) / 1000), morning);
      expect(q).toMatchObject({ close: 62_500, date: '2026-10-16' });
    });

    it("keeps yesterday's US close, which is not today in New York", () => {
      // 01:00 in New York: the last bar (Oct 14, 16:00) is a finished session.
      const q = parseChart('Test', 'T', chart, new Date('2026-10-15T05:00:00Z'));
      expect(q).toMatchObject({ close: 110, date: '2026-10-14' });
    });
  });

  it('flags numbers that are not in the table', () => {
    const quotes: Quote[] = [{ label: 'S&P 500', symbol: '^GSPC', currency: 'USD', date: '2026-10-14', close: 7711.52, dayChangePct: -0.096, weekChangePct: 1.234 }];
    expect(unmatchedMarketNumbers('The S&P closed at 7,711.52, down 0.1 percent, up 1.2% over the week, around 7,700.', quotes)).toEqual([]);
    expect(unmatchedMarketNumbers('It hit 7,950 and fell 2.5 percent in 2026.', quotes)).toEqual(['7,950', '2.5']);
  });
});

describe('script', () => {
  const lines = (n: number, speaker = 'Mia') => Array.from({ length: n }, (_, i) => ({ speaker, text: `Line ${i} ${'word '.repeat(20)}` }));

  it('chunks at line boundaries under the size limit', () => {
    const sections: Section[] = [{ id: 'a', title: 'A', lines: lines(30) }];
    const chunks = chunkForTts(sections, 1000);
    expect(chunks.flat()).toHaveLength(30);
    for (const c of chunks) expect(c.reduce((n, l) => n + l.speaker.length + l.text.length + 3, 0)).toBeLessThanOrEqual(1000);
  });

  it('splits word budgets across sections', () => {
    const b = wordBudget(1800);
    expect(Object.values(b).reduce((a, n) => a + n, 0)).toBeCloseTo(1800, -1);
  });
});

describe('review rules', () => {
  const draft = {
    title: 'T', description: 'D', predictions: [], open_threads: [], story_summaries: [],
    sections: (['quick_hits', 'headlines', 'main_1', 'main_2', 'segment'] as const).map((id) => ({
      id, title: id,
      lines: [
        { speaker: 'Mia', text: 'word '.repeat(150) },
        { speaker: 'Theo', text: 'word '.repeat(150) },
      ],
    })),
  };
  const spoken = { weekday: 'Thursday', date: 'October 15' };

  it('assembles opening, sections in order, closing', () => {
    const sections = assembleSections(config, draft, spoken);
    expect(sections.map((s) => s.id)).toEqual(['opening', 'headlines', 'main_1', 'main_2', 'segment', 'quick_hits', 'closing']);
    expect(sections[0]!.lines[0]!.text).toContain('Thursday, October 15');
  });

  it('flags long lines, banned phrases, length and unknown speakers', () => {
    const bad = structuredClone(draft);
    bad.sections[0]!.lines.push({ speaker: 'Narrator', text: "Let's dive in." });
    const issues = ruleIssues(config, assembleSections(config, bad, spoken), 3000, 'deep_dive', []);
    const problems = issues.map((i) => i.problem).join('\n');
    expect(problems).toContain('Unknown speaker "Narrator"');
    expect(problems).toContain('Banned phrase');
    expect(problems).toContain('too long');
    expect(problems).toContain('target is 3000');
  });
});

describe('selection checks', () => {
  const items = ['world', 'world', 'science', 'gaming', 'culture'].map((topic, i) => ({
    id: `s${i + 1}`, feed: 'F', topic, title: `T${i}`, url: `https://x.com/${i}`, published: new Date(), snippet: '',
  }));
  const selection = { headlines: ['s1', 's3'], main: [{ id: 's1', angle: '' }, { id: 's2', angle: '' }], quick_hits: ['s4', 's5'], segment_items: [], notes: '' };

  it('computes the outside share over distinct picks', () => {
    expect(outsideShare(config, selection, items)).toBeCloseTo(2 / 5);
  });

  it('rejects unknown ids and repeated main stories', () => {
    expect(validateSelection(config, { ...selection, quick_hits: ['s1', 's9'] }, items)).toEqual(['unknown id s9', 'quick hits repeat a main story']);
  });
});

describe('helpers', () => {
  it('extracts JSON from fenced model output', () => {
    expect(extractJson('Sure!\n```json\n{"a": [1]}\n```')).toEqual({ a: [1] });
  });

  it('turns article HTML into text', () => {
    expect(htmlToText('<html><nav>menu</nav><article><h1>Title</h1><p>A &amp; B&#39;s <b>news</b></p><script>x()</script></article></html>')).toBe("Title\nA & B's news");
  });

  it('writes a valid WAV header', () => {
    const wav = pcmToWav(Buffer.alloc(48_000));
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.length).toBe(48_044);
  });
});

describe('feed', () => {
  const episode: EpisodeRecord = {
    number: 1, date: '2026-10-15', publishedAt: '2026-10-15T05:20:00Z', weekday: 'thursday', segment: 'markets',
    title: 'Chips & <dips>', description: 'Desc', audioUrl: 'https://github.com/u/r/releases/download/ep-2026-10-15/a.mp3',
    audioBytes: 1234, durationSeconds: 731, stories: [], predictions: [], openThreads: [], transcriptFile: '', notesFile: '',
  };

  it('formats durations', () => expect(hms(3725)).toBe('01:02:05'));

  it('escapes markdown into safe HTML', () => {
    expect(markdownToHtml('- [A <b>](https://x.com/a)\n- plain')).toBe('<ul><li><a href="https://x.com/a">A &lt;b&gt;</a></li><li>plain</li></ul>');
  });

  it('builds an RSS feed with enclosure and no owner email when blank', () => {
    const xml = buildFeed(config, [episode], () => 'Notes with ]]> inside');
    expect(xml).toContain('<title>Chips &amp; &lt;dips&gt;</title>');
    expect(xml).toContain('<enclosure url="https://github.com/u/r/releases/download/ep-2026-10-15/a.mp3" length="1234" type="audio/mpeg"/>');
    expect(xml).toContain('<itunes:duration>00:12:11</itunes:duration>');
    expect(xml).not.toContain('<itunes:email>');
    expect(xml).not.toMatch(/\]\]>[^<\s]/);
  });
});

describe('model fallback', () => {
  const apiError = (status: number, message: string) => new ApiError({ status, message });

  it('classifies API errors', () => {
    expect(classify(apiError(503, 'high demand'))).toBe('retry');
    expect(classify(apiError(429, '{"retryDelay": "20s"}'))).toBe('retry');
    expect(classify(apiError(429, 'Quota exceeded for metric: x, limit: 0, model: y'))).toBe('next-model');
    expect(classify(apiError(429, '"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"'))).toBe('next-model');
    expect(classify(apiError(404, 'models/foo is not found'))).toBe('next-model');
    expect(classify(apiError(400, 'Invalid JSON payload'))).toBe('fatal');
  });

  it('moves to the next model when one has no quota', async () => {
    const tried: string[] = [];
    const result = await withModels('t', ['a', 'b'], async (model) => {
      tried.push(model);
      if (model === 'a') throw apiError(429, 'limit: 0');
      return model;
    });
    expect(result).toBe('b');
    expect(tried).toEqual(['a', 'b']);
  });

  it('names the exhausted quota', () => {
    const err = apiError(429, '{"error":{"message":"You exceeded your current quota","details":[{"quotaId":"GoogleSearchGroundingPerDay"}]}}');
    expect(describeError(err)).toBe('429 You exceeded your current quota [quota: GoogleSearchGroundingPerDay]');
  });
});

describe('market numbers in instrument names', () => {
  it('ignores the 500 in S&P 500 and the 100 in Nasdaq 100', () => {
    const quotes: Quote[] = [
      { label: 'S&P 500', symbol: '^GSPC', currency: 'USD', date: '2026-10-15', close: 7722.24, dayChangePct: 0.04, weekChangePct: -0.56 },
      { label: 'Nasdaq 100', symbol: '^NDX', currency: 'USD', date: '2026-10-15', close: 29761.03, dayChangePct: -0.63, weekChangePct: -3.14 },
    ];
    expect(unmatchedMarketNumbers('The S&P 500 closed at 7722.24 and the Nasdaq 100 fell 0.63 percent.', quotes)).toEqual([]);
    expect(unmatchedMarketNumbers('Looking at the table for Thursday, October 15 (or 15 October).', quotes)).toEqual([]);
    expect(unmatchedMarketNumbers('Shares rose 15 percent on October 15.', quotes)).toEqual(['15']);
  });

  const labels = config.markets.instruments.map((i) => i.label);
  const sp: Quote[] = [{ label: 'S&P 500', symbol: '^GSPC', currency: 'USD', date: '2026-10-15', close: 7722.24, dayChangePct: 0.04, weekChangePct: -0.56 }];

  it('strips every configured instrument name, in any case and with a hyphen or no space', () => {
    expect(unmatchedMarketNumbers('The nasdaq-100, the Nasdaq100, the s&p 500 and the S&P-500.', sp, labels)).toEqual([]);
    // No Nasdaq 100 quote today, but its name still isn't a figure.
    expect(unmatchedMarketNumbers('The Nasdaq 100 had no data.', sp, labels)).toEqual([]);
  });

  it('ignores times, ordinals and durations', () => {
    expect(unmatchedMarketNumbers('At 8:30 on the 17th, after a 30-day slide and a 12 month run over 52 weeks.', sp, labels)).toEqual([]);
  });

  it('allows 2% after about, around, roughly, nearly and almost, and only there', () => {
    expect(unmatchedMarketNumbers('It sits at roughly 7,600, nearly 7,850 at one point, almost 7,900.', sp, labels)).toEqual(['7,900']);
    expect(unmatchedMarketNumbers('It sits at 7,600.', sp, labels)).toEqual(['7,600']);
  });
});
