/**
 * Episode art: one illustration of the lead story (Gemini image model), published as WebP, plus the
 * "theme colour" picked from its pixels. The site derives each card's light and dark accents from that colour.
 */
import type { GenerateContentResponse } from '@google/genai';
import { writeFileSync } from 'node:fs';
import type { Config } from './config';
import type { StoryRecord } from './history';
import { themeColor } from './color';
import { ai, describeError, ModelOutputError, withModelsNamed, withTimeout } from './llm';

/** Per request, and for the whole image step: the episode is already good, so the image may not hold it up. */
export const ART_TIMEOUT_MS = 90_000;
export const ART_DEADLINE_MS = 180_000;

/** Fixed rules that keep the image usable as a card background and keep real people out of it. */
export const ART_RULES = [
  'Wide 16:9 image.',
  'Place the main subject in the right third of the frame. Keep the left third calm and low in detail, because text is laid over it.',
  'No text of any kind: no letters, numbers, captions, signs, logos, mascots or watermarks.',
  'Do not depict any real, recognisable person. Show people only as anonymous silhouettes or small distant figures; tell the story through places, objects and symbols.',
  'Show one ordinary, concrete scene from the story, as it could really look. No glowing effects, sparkles, particles, holograms, floating code, light beams or surreal mash-ups of several ideas.',
  'No gore or graphic violence.',
];

/** Only the lead story: the episode title mixes several stories, which invites a mash-up. */
export function artPrompt(config: Config, lead: Pick<StoryRecord, 'title' | 'summary'>): string {
  return [config.art.style.trim(), ART_RULES.join(' '), `The story: ${lead.title}. ${lead.summary}`.trim()].join('\n\n');
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
            config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' }, abortSignal },
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
): Promise<{ color: string; model: string } | undefined> {
  if (!config.art.enabled) return undefined;
  if (!lead) {
    console.warn('::warning::No lead story to illustrate; the episode has no image.');
    return undefined;
  }
  try {
    const { webp, color, model } = await withTimeout(ART_DEADLINE_MS, async () => {
      const { image, model } = await generateArt(config, artPrompt(config, lead));
      return { ...(await processArt(config, image)), model };
    });
    writeFileSync(path, webp);
    console.log(`[art] ${model}: ${Math.round(webp.length / 1024)} KB, theme colour ${color}`);
    return { color, model };
  } catch (err) {
    console.warn(`::warning::No episode image (${describeError(err)}); the site draws one instead.`);
    return undefined;
  }
}
