/**
 * Render assets/cover.svg to assets/cover.png (3000×3000, what Spotify wants).
 * The font comes from @fontsource/archivo-black; resvg needs TrueType, so the WOFF is unpacked first.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

/** WOFF 1.0 → plain sfnt (TTF/OTF) bytes. */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('not a WOFF 1.0 file');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const at = 44 + i * 20;
    const offset = woff.readUInt32BE(at + 4);
    const compLength = woff.readUInt32BE(at + 8);
    const origLength = woff.readUInt32BE(at + 12);
    const raw = woff.subarray(offset, offset + compLength);
    return {
      tag: woff.readUInt32BE(at),
      checksum: woff.readUInt32BE(at + 16),
      data: compLength < origLength ? inflateSync(raw) : Buffer.from(raw),
    };
  });
  const pow = 2 ** Math.floor(Math.log2(numTables));
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(Math.log2(pow), 8);
  header.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = header.length;
  const bodies: Buffer[] = [];
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    header.writeUInt32BE(t.tag, at);
    header.writeUInt32BE(t.checksum, at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(t.data.length, at + 12);
    const padded = Buffer.alloc(Math.ceil(t.data.length / 4) * 4);
    t.data.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });
  return Buffer.concat([header, ...bodies]);
}

const require = createRequire(import.meta.url);
const woff = readFileSync(require.resolve('@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff'));
const fontFile = join(mkdtempSync(join(tmpdir(), 'cover-')), 'ArchivoBlack.ttf');
writeFileSync(fontFile, woffToSfnt(woff));
const svg = readFileSync('assets/cover.svg', 'utf8');
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 3000 },
  font: { fontFiles: [fontFile], loadSystemFonts: false, defaultFontFamily: 'Archivo Black' },
})
  .render()
  .asPng();
writeFileSync('assets/cover.png', png);
console.log(`[cover] wrote assets/cover.png (${Math.round(png.length / 1024)} KB)`);
