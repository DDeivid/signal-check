/**
 * Colour helpers for episode cards: the theme colour of an image, and the light and dark card colours
 * derived from it. No image library here, so the site build doesn't load one.
 */

export type Rgb = [number, number, number];

export function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

export const toHex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export const fromHex = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/**
 * The image's theme colour: the dominant hue among vivid, mid-light pixels of the part a card shows
 * (the right side, `fromX` onwards), averaged within that hue. Grey images give a grey, which the site treats as neutral.
 */
export function themeColor(pixels: Uint8Array, width: number, height: number, fromX = 0.4): string {
  const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const x0 = Math.floor(width * fromX);
  for (let y = 0; y < height; y++) {
    for (let x = x0; x < width; x++) {
      const i = (y * width + x) * 3;
      const rgb: Rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      const [h, s, l] = toHsl(rgb);
      // Squared, so pale paper or deep shadow can't outvote a smaller area of real ink.
      const w = s * (1 - Math.abs(l - 0.5) * 2) ** 2 + 0.001;
      const bin = bins[Math.floor(h / 10) % 36]!;
      bin.w += w;
      bin.r += rgb[0] * w;
      bin.g += rgb[1] * w;
      bin.b += rgb[2] * w;
    }
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  return toHex([best.r / best.w, best.g / best.w, best.b / best.w].map(Math.round) as Rgb);
}

/** Card colours for both themes, derived from a theme colour. Accents reach 4.5:1 against their card tint. */
export interface CardTheme {
  accentLight: string;
  accentDark: string;
  onAccentLight: string;
  onAccentDark: string;
  tintLight: string;
  tintDark: string;
}

export const MIN_CONTRAST = 4.5;

export function cardTheme(hex: string): CardTheme {
  const [h, s0] = toHsl(fromHex(hex));
  // A grey image gets a quiet near-neutral card instead of an invented colour.
  const s = s0 < 0.12 ? 0.08 : Math.min(0.85, Math.max(0.4, s0));
  const tintLight = fromHsl(h, Math.min(s, 0.4), 0.955);
  const tintDark = fromHsl(h, Math.min(s, 0.4) * 0.7, 0.085);
  let accentLight = fromHsl(h, s, 0.5);
  for (let l = 0.5; contrast(accentLight, tintLight) < MIN_CONTRAST && l > 0; l -= 0.02) accentLight = fromHsl(h, s, l);
  let accentDark = fromHsl(h, s, 0.55);
  for (let l = 0.55; contrast(accentDark, tintDark) < MIN_CONTRAST && l < 1; l += 0.02) accentDark = fromHsl(h, s, l);
  const on = (c: Rgb): Rgb => (contrast(c, [255, 255, 255]) >= contrast(c, [17, 17, 17]) ? [255, 255, 255] : [17, 17, 17]);
  return {
    accentLight: toHex(accentLight),
    accentDark: toHex(accentDark),
    onAccentLight: toHex(on(accentLight)),
    onAccentDark: toHex(on(accentDark)),
    tintLight: toHex(tintLight),
    tintDark: toHex(tintDark),
  };
}
