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

/** Free-form research question, used for open threads and prediction grading. */
export async function researchQuestion(config: Config, label: string, question: string): Promise<Research> {
  const { notes, sources } = await research(config, label, question);
  return { topic: label, notes, articleText: '', sources };
}
