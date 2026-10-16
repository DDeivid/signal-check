import type { Config } from '../config';
import { fetchText, type FeedItem } from '../feeds';
import { describeError, generateText, type Source } from '../llm';

export interface Research {
  topic: string;
  notes: string;
  articleText: string;
  sources: Source[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function htmlToText(html: string): string {
  const article = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
  return article
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

async function articleText(url: string, maxChars: number): Promise<string> {
  try {
    return htmlToText(await fetchText(url, 15_000)).slice(0, maxChars);
  } catch {
    return '';
  }
}

const SYSTEM =
  'You are a careful research assistant for a news podcast. Separate established facts from claims and speculation, ' +
  'name who says what, and give dates. Say plainly when something is unclear. Plain text, no markdown tables.';

/** Set after the first failed web search, so the rest of the run doesn't keep paying for retries. */
let searchUnavailable = false;

async function research(config: Config, label: string, prompt: string): Promise<{ notes: string; sources: Source[] }> {
  if (config.research.grounding && !searchUnavailable) {
    try {
      const { text, sources } = await generateText(config, { label, system: SYSTEM, prompt, grounding: true, temperature: 0.2 });
      return { notes: text, sources };
    } catch (err) {
      searchUnavailable = true;
      console.warn(`::warning::Web search unavailable, researching without it for the rest of this run: ${describeError(err)}`);
    }
  }
  const offline = `${prompt}\n\nYou have no web access. Use only the article text above for anything recent. Add background only where it is well established and older than the story; never guess at recent developments.`;
  const { text } = await generateText(config, { label, system: SYSTEM, prompt: offline, temperature: 0.2 });
  return { notes: `(Written without web search; treat as background only.)\n${text}`, sources: [] };
}

/** Background for one story: the article itself plus researched context. */
export async function researchStory(config: Config, item: FeedItem, angle: string, deep: boolean): Promise<Research> {
  const text = await articleText(item.url, config.research.article_chars);
  const prompt = `Story: ${item.title}
Source: ${item.feed}, ${item.url}, published ${item.published.toISOString()}
Feed summary: ${item.snippet}
Planned angle: ${angle}
${text ? `\nArticle text (may be partial):\n${text}\n` : ''}
Research this story for a podcast segment of ${deep ? 'about 6 minutes' : 'about 2-3 minutes'}. Cover:
1. What happened, precisely (who, what, when, numbers).
2. Background a listener needs, and how we got here.
3. Reactions and the strongest arguments on each side.
4. What is still unknown or disputed.
5. What to watch next${deep ? ', plus history, earlier precedents and the most important numbers' : ''}.`;
  const { notes, sources } = await research(config, `research:${item.id}`, prompt);
  return { topic: item.title, notes, articleText: text, sources: [{ title: `${item.feed}: ${item.title}`, url: item.url }, ...sources] };
}

/** About this many of the window's items go along as evidence for follow-up research. */
export const EVIDENCE_CAP = 120;
export const NO_UPDATE = 'no update in today\'s news';
export const FROM_ITEMS_ONLY = '(Derived only from the news items listed with these notes, without web search. Anything not tied to an item id is not established.)';

/** One line per item: id, title, feed, date, snippet. */
export function evidenceLines(items: FeedItem[]): string {
  return items.map((i) => `[${i.id}] ${i.title} (${i.feed}, ${i.published.toISOString().slice(0, 10)}) ${i.snippet.slice(0, 220)}`).join('\n');
}

/** Item ids cited as [s12] in `text` that exist in `items`, in order of first mention; plus cited ids that don't exist. */
export function citations(text: string, items: FeedItem[]): { known: string[]; unknown: string[] } {
  const ids = new Set(items.map((i) => i.id));
  const cited = [...new Set([...text.matchAll(/\[(s\d+)\]/g)].map((m) => m[1]!))];
  return { known: cited.filter((id) => ids.has(id)), unknown: cited.filter((id) => !ids.has(id)) };
}

export function newsEvidencePrompt(question: string, evidence: FeedItem[], grounded: boolean): string {
  return `${question}

TODAY'S NEWS ITEMS (id, title, feed, date, snippet)
${evidenceLines(evidence)}

Rules:
- ${grounded ? 'Use these items first; you may add web sources, named and dated.' : 'These items are your only evidence. You have no web access, and your memory of recent events is not evidence.'}
- Every update must cite the ids of the items it rests on in square brackets, e.g. [s12] [s40].
- Where no item bears on a point, write "${NO_UPDATE}" for it. Don't fill the gap.`;
}

export interface NewsResearch extends Research {
  /** Ids of the listed items the notes cite. */
  cited: string[];
  /** True when the notes come only from the listed items (no web search). */
  itemsOnly: boolean;
}

/**
 * Follow-up research (Monday threads, Friday predictions) with the news window's items as evidence.
 * Without grounding the model has nothing else, so it must cite item ids or say there's no update.
 */
export async function researchFromNews(config: Config, label: string, question: string, evidence: FeedItem[]): Promise<NewsResearch> {
  if (config.research.grounding && !searchUnavailable) {
    try {
      const { text, sources } = await generateText(config, { label, system: SYSTEM, prompt: newsEvidencePrompt(question, evidence, true), grounding: true, temperature: 0.2 });
      return { topic: label, notes: text, articleText: '', sources, cited: citations(text, evidence).known, itemsOnly: false };
    } catch (err) {
      searchUnavailable = true;
      console.warn(`::warning::Web search unavailable, researching without it for the rest of this run: ${describeError(err)}`);
    }
  }
  const { text } = await generateText(config, { label, system: SYSTEM, prompt: newsEvidencePrompt(question, evidence, false), temperature: 0.2 });
  const { known, unknown } = citations(text, evidence);
  if (unknown.length) console.warn(`[research] ${label} cites ids that aren't in the list: ${unknown.join(', ')}`);
  return { topic: label, notes: `${FROM_ITEMS_ONLY}\n${text}`, articleText: '', sources: [], cited: known, itemsOnly: true };
}
