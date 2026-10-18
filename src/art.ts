/**
 * Episode art: one illustration of the lead story (Gemini image model), published as WebP, plus the
 * "theme colour" picked from its pixels. The site derives each card's light and dark accents from that colour.
 */
import type { GenerateContentResponse } from '@google/genai';
import { randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Config } from './config';
import type { EpisodeRecord, StoryRecord } from './history';
import { themeColor } from './color';
import { ai, describeError, ModelOutputError, withModelsNamed, withTimeout } from './llm';

/** Per request, and for the whole image step: the episode is already good, so the image may not hold it up. */
export const ART_TIMEOUT_MS = 90_000;
export const ART_DEADLINE_MS = 180_000;

/**
 * The rules that don't change with taste, always sent after the configured ones: the crop the site needs,
 * and no real people. A photo-real "documentary" picture of a named person next to real news would be a fake
 * news photo, so this one is not in podcast.config.yaml.
 */
export const FIXED_RULES = [
  'Wide 16:9 image.',
  'Never show a real, identifiable person: no public figure, nobody named in the story, and no likeness of them. Any people in the picture are anonymous strangers; anyone who could be taken for a person in the story is seen from behind, at a distance or out of focus.',
];

/** Looks used by the last `art.no_repeat` episodes that have images, newest last. */
export function recentLooks(config: Config, episodes: EpisodeRecord[]): string[] {
  const n = config.art.no_repeat;
  return n ? episodes.flatMap((e) => (e.art?.look ? [e.art.look] : [])).slice(-n) : [];
}

/**
 * A look drawn at random (crypto-grade, no date pattern), leaving out recently used ones so nothing
 * repeats within `no_repeat` episodes. Undefined when no looks are configured.
 */
export function pickLook(looks: string[], recent: string[], random: (n: number) => number = randomInt): string | undefined {
  if (!looks.length) return undefined;
  const fresh = looks.filter((l) => !recent.includes(l));
  const pool = fresh.length ? fresh : looks;
  return pool[random(pool.length)];
}

/** Style, the look, the configured rules, the fixed rules, then the story. Only the lead story: a title that mixes several invites a mash-up. */
export function artPrompt(config: Config, lead: Pick<StoryRecord, 'title' | 'summary'>, look?: string): string {
  const rules = [...config.art.rules, ...FIXED_RULES].map((r) => `- ${r.trim()}`).join('\n');
  return [
    config.art.style.trim(),
    ...(look ? [`The look for this photograph: ${look.trim()}`] : []),
    `Rules:\n${rules}`,
    `The story: ${lead.title}. ${lead.summary}`.trim(),
  ].join('\n\n');
}

/** The image part of a response, or a ModelOutputError (blocked, cut off, or text only). */
export function imagePart(response: GenerateContentResponse): Buffer {
  const candidate = response.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new ModelOutputError(`image stopped early (finish reason: ${candidate.finishReason})`);
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'));
  if (!part?.inlineData?.data) throw new ModelOutputError(`no image in the response (finish reason: ${candidate?.finishReason ?? 'unknown'})`);
  return Buffer.from(part.inlineData.data, 'base64');
}

export async function generateArt(config: Config, prompt: string): Promise<{ image: Buffer; model: string }> {
  const { result, model } = await withModelsNamed(
    'art',
    config.art.models,
    async (m) =>
      imagePart(
        await withTimeout(ART_TIMEOUT_MS, (abortSignal) =>
          ai().generateContent('art', {
            model: m,
            contents: prompt,
            config: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '16:9', ...(config.art.image_size ? { imageSize: config.art.image_size } : {}) },
              abortSignal,
            },
          }),
        ),
      ),
    2,
  );
  return { image: result, model };
}

/** The image as a 16:9 WebP of the configured width, and its theme colour. */
export async function processArt(config: Config, image: Buffer): Promise<{ webp: Buffer; color: string }> {
  // Loaded here, not at startup: if the native module ever fails to load, only the image is lost.
  const { default: sharp } = await import('sharp');
  const width = config.art.width;
  const webp = await sharp(image).resize({ width, height: Math.round((width * 9) / 16), fit: 'cover' }).webp({ quality: 80 }).toBuffer();
  const W = 96;
  const H = 54;
  const pixels = await sharp(image).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return { webp, color: themeColor(pixels, W, H) };
}

/**
 * Illustrate an episode's lead story and save it as WebP at `path`. Never throws: an episode without an
 * image still publishes, so a failure is a warning and the result is undefined.
 */
export async function makeArt(
  config: Config,
  lead: Pick<StoryRecord, 'title' | 'summary'> | undefined,
  path: string,
  recent: string[] = [],
): Promise<{ color: string; model: string; look?: string } | undefined> {
  if (!config.art.enabled) return undefined;
  if (!lead) {
    console.warn('::warning::No lead story to illustrate; the episode has no image.');
    return undefined;
  }
  const look = pickLook(config.art.looks, recent);
  if (look) console.log(`[art] look: ${look}`);
  try {
    const { webp, color, model } = await withTimeout(ART_DEADLINE_MS, async () => {
      const { image, model } = await generateArt(config, artPrompt(config, lead, look));
      return { ...(await processArt(config, image)), model };
    });
    writeFileSync(path, webp);
    console.log(`[art] ${model}: ${Math.round(webp.length / 1024)} KB, theme colour ${color}`);
    return { color, model, ...(look ? { look } : {}) };
  } catch (err) {
    console.warn(`::warning::No episode image (${describeError(err)}); the site draws one instead.`);
    return undefined;
  }
}
