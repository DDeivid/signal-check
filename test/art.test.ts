import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerateContentResponse } from '@google/genai';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { artPrompt, FIXED_RULES, imagePart, makeArt } from '../src/art';
import { cardTheme, contrast, fromHex, MIN_CONTRAST, themeColor, toHsl } from '../src/color';
import { loadConfig } from '../src/config';
import { FAKE_ART_COLOR, fakeAiClient, textResponse } from '../src/fake-ai';
import { ModelOutputError, resetModelState, setAiClient } from '../src/llm';

const config = loadConfig();
const lead = { title: 'Refinery strikes resume', summary: 'Strikes on refineries resumed after a ceasefire collapsed.' };

afterEach(() => {
  setAiClient(undefined);
  resetModelState();
});

/** RGB pixels: `left` up to x = split, `right` after it. */
function pixels(width: number, height: number, left: string, right: string, split = 0.4): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out.set(fromHex(x < width * split ? left : right), (y * width + x) * 3);
  }
  return out;
}

const hueDistance = (a: string, b: string) => {
  const d = Math.abs(toHsl(fromHex(a))[0] - toHsl(fromHex(b))[0]);
  return Math.min(d, 360 - d);
};

describe('theme colour', () => {
  it('reads the colour of the part a card shows (the right side)', () => {
    const color = themeColor(pixels(96, 54, '#D7263D', '#2E86C1'), 96, 54);
    expect(hueDistance(color, '#2E86C1')).toBeLessThan(6);
  });

  it('prefers a vivid colour over a larger grey area', () => {
    const px = pixels(96, 54, '#808080', '#808080');
    for (let y = 40; y < 54; y++) for (let x = 60; x < 96; x++) px.set(fromHex('#E8591C'), (y * 96 + x) * 3);
    expect(hueDistance(themeColor(px, 96, 54), '#E8591C')).toBeLessThan(6);
  });

  it('picks the ink, not the paper, in a print with lots of plain paper', () => {
    const px = pixels(96, 54, '#F8F0DD', '#F8F0DD');
    for (let y = 30; y < 54; y++) for (let x = 70; x < 84; x++) px.set(fromHex('#C2602F'), (y * 96 + x) * 3);
    for (let y = 30; y < 54; y++) for (let x = 84; x < 96; x++) px.set(fromHex('#1F2A4A'), (y * 96 + x) * 3);
    expect(hueDistance(themeColor(px, 96, 54), '#C2602F')).toBeLessThan(6);
  });

  it.each(['#FFD21F', '#2E86C1', '#102030', '#F0F0F0', '#7A7A7A', '#00FF66', '#8B0000', '#3F8F75'])(
    'gives readable accents in both themes for %s',
    (hex) => {
      const t = cardTheme(hex);
      expect(contrast(fromHex(t.accentLight), fromHex(t.tintLight))).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast(fromHex(t.accentDark), fromHex(t.tintDark))).toBeGreaterThanOrEqual(MIN_CONTRAST);
      // Text on the play button.
      expect(contrast(fromHex(t.onAccentLight), fromHex(t.accentLight))).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast(fromHex(t.onAccentDark), fromHex(t.accentDark))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    },
  );

  it('keeps a grey image near neutral instead of inventing a colour', () => {
    const [, s] = toHsl(fromHex(cardTheme('#7A7A7A').accentLight));
    expect(s).toBeLessThan(0.15);
  });
});

describe('episode image', () => {
  it('sends the style, the configured rules, the fixed safety rules and only the lead story, in that order', () => {
    const custom = { ...config, art: { ...config.art, style: 'STYLE', rules: ['Rule A', 'Rule B'] } };
    const prompt = artPrompt(custom, lead);
    const at = (t: string) => prompt.indexOf(t);
    expect(at('STYLE')).toBe(0);
    expect(at('- Rule A')).toBeGreaterThan(0);
    expect(at('- Rule B')).toBeGreaterThan(at('- Rule A'));
    for (const rule of FIXED_RULES) expect(at(`- ${rule}`)).toBeGreaterThan(at('- Rule B'));
    expect(at('The story: Refinery strikes resume. Strikes on refineries')).toBeGreaterThan(at(`- ${FIXED_RULES[1]}`));
  });

  it('keeps the no-real-people rule even with no configured rules', () => {
    const prompt = artPrompt({ ...config, art: { ...config.art, rules: [] } }, lead);
    expect(prompt).toMatch(/Never show a real, identifiable person/);
  });

  it('asks for the configured render size', async () => {
    const seen: unknown[] = [];
    const fake = fakeAiClient({});
    setAiClient({ generateContent: (label, params) => (seen.push(params.config?.imageConfig), fake.generateContent(label, params)) });
    const file = join(mkdtempSync(join(tmpdir(), 'sc-art-')), 'art.webp');
    await makeArt({ ...config, art: { ...config.art, image_size: '2K' } }, lead, file);
    expect(seen[0]).toEqual({ aspectRatio: '16:9', imageSize: '2K' });
  });

  it('treats a text-only or blocked answer as no image', () => {
    expect(() => imagePart(textResponse('Here is a description instead.'))).toThrow(ModelOutputError);
    const blocked = new GenerateContentResponse();
    blocked.candidates = [{ content: { role: 'model', parts: [] }, finishReason: 'PROHIBITED_CONTENT' as never }];
    expect(() => imagePart(blocked)).toThrow(/finish reason: PROHIBITED_CONTENT/);
  });

  it('saves a 16:9 WebP and its theme colour', async () => {
    setAiClient(fakeAiClient({}));
    const file = join(mkdtempSync(join(tmpdir(), 'sc-art-')), 'art.webp');
    const art = await makeArt(config, lead, file);
    expect(art?.model).toBe(config.art.models[0]);
    expect(hueDistance(art!.color, FAKE_ART_COLOR)).toBeLessThan(6);
    const meta = await sharp(readFileSync(file)).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([config.art.width, Math.round((config.art.width * 9) / 16)]);
  });

  it('returns nothing, without throwing, when every model fails', async () => {
    setAiClient(fakeAiClient({ artFails: true }));
    const file = join(mkdtempSync(join(tmpdir(), 'sc-art-')), 'art.webp');
    expect(await makeArt(config, lead, file)).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });

  it('does nothing when art is off or there is no lead story', async () => {
    setAiClient(fakeAiClient({}));
    const file = join(mkdtempSync(join(tmpdir(), 'sc-art-')), 'art.webp');
    expect(await makeArt({ ...config, art: { ...config.art, enabled: false } }, lead, file)).toBeUndefined();
    expect(await makeArt(config, undefined, file)).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });
});
