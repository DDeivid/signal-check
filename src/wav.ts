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
