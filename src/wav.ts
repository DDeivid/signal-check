export const SAMPLE_RATE = 24_000;

/** Wrap raw 16-bit little-endian mono PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function silence(ms: number, sampleRate = SAMPLE_RATE): Buffer {
  return pcmToWav(Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2), sampleRate);
}

function toPcm(samples: Float32Array): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32_767), i * 2));
  return pcm;
}

interface Note {
  freq: number;
  start: number;
  length: number;
}

/** Soft bell-like chimes: a sine with a quiet octave, fast attack, exponential decay. */
export function chimes(notes: Note[], seconds: number, sampleRate = SAMPLE_RATE): Buffer {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (const note of notes) {
    const from = Math.round(note.start * sampleRate);
    const len = Math.round(note.length * sampleRate);
    for (let i = 0; i < len && from + i < out.length; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 4);
      const tone = Math.sin(2 * Math.PI * note.freq * t) + 0.25 * Math.sin(4 * Math.PI * note.freq * t);
      out[from + i]! += 0.28 * env * tone;
    }
  }
  return pcmToWav(toPcm(out), sampleRate);
}

// Rising arpeggio, then a two-note "check".
export const INTRO_NOTES: Note[] = [
  { freq: 523.25, start: 0, length: 1.2 },
  { freq: 659.25, start: 0.16, length: 1.2 },
  { freq: 783.99, start: 0.32, length: 1.2 },
  { freq: 880.0, start: 0.75, length: 0.9 },
  { freq: 1046.5, start: 0.9, length: 1.6 },
];

export const OUTRO_NOTES: Note[] = [
  { freq: 1046.5, start: 0, length: 1.2 },
  { freq: 783.99, start: 0.2, length: 1.2 },
  { freq: 659.25, start: 0.4, length: 1.2 },
  { freq: 523.25, start: 0.6, length: 2.0 },
];

export interface DecodedWav {
  sampleRate: number;
  channels: number;
  bits: number;
  /** Mono samples in -1..1 (channels averaged). */
  samples: Float32Array;
}

/** Read a RIFF/WAVE file with 16-bit PCM or 32-bit float samples. Throws on anything else. */
export function decodeWav(buf: Buffer): DecodedWav {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | undefined;
  let data: Buffer | undefined;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString('latin1', at, at + 4);
    const declared = buf.readUInt32LE(at + 4);
    // Streamed WAVs may leave the data size at 0 or 0xFFFFFFFF: then the data runs to the end of the file.
    const size = id === 'data' && (declared === 0 || at + 8 + declared > buf.length) ? buf.length - at - 8 : declared;
    const body = buf.subarray(at + 8, at + 8 + size);
    if (id === 'fmt ') {
      let format = body.readUInt16LE(0);
      if (format === 0xfffe && body.length >= 26) format = body.readUInt16LE(24); // WAVE_FORMAT_EXTENSIBLE: sub-format
      fmt = { format, channels: body.readUInt16LE(2), sampleRate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    } else if (id === 'data') {
      data = body;
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV file without fmt or data chunk');
  const { format, channels, sampleRate, bits } = fmt;
  const pcm16 = format === 1 && bits === 16;
  const float32 = format === 3 && bits === 32;
  if (!pcm16 && !float32) throw new Error(`unsupported WAV sample format (format ${format}, ${bits}-bit)`);
  const frameBytes = (bits / 8) * channels;
  const frames = Math.floor(data.length / frameBytes);
  const samples = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = f * frameBytes + c * (bits / 8);
      sum += pcm16 ? data.readInt16LE(at) / 32_768 : data.readFloatLE(at);
    }
    samples[f] = sum / channels;
  }
  return { sampleRate, channels, bits, samples };
}

/** Mono samples at any rate → 16-bit PCM at SAMPLE_RATE (block average for whole multiples, else linear). */
export function toPcm16(samples: Float32Array, fromRate: number, toRate = SAMPLE_RATE): Buffer {
  let out: Float32Array;
  if (fromRate === toRate) out = samples;
  else if (fromRate % toRate === 0) {
    const k = fromRate / toRate;
    out = new Float32Array(Math.floor(samples.length / k));
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (let j = 0; j < k; j++) sum += samples[i * k + j]!;
      out[i] = sum / k;
    }
  } else {
    out = new Float32Array(Math.floor((samples.length * toRate) / fromRate));
    for (let i = 0; i < out.length; i++) {
      const pos = (i * fromRate) / toRate;
      const a = Math.floor(pos);
      const t = pos - a;
      out[i] = (samples[a] ?? 0) * (1 - t) + (samples[a + 1] ?? samples[a] ?? 0) * t;
    }
  }
  const pcm = Buffer.alloc(out.length * 2);
  out.forEach((s, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32_767), i * 2));
  return pcm;
}
