import { FinishReason, GenerateContentResponse } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { audioPart } from '../src/tts';
import { decodeWav, pcmToWav, SAMPLE_RATE, toPcm16 } from '../src/wav';

/** A WAV with the given format, filled with a constant sample value per channel. */
function wav(opts: { rate: number; channels: number; bits: 16 | 32 | 8; format?: number; frames: number; value?: number; streamed?: boolean }): Buffer {
  const { rate, channels, bits, frames, value = 0.5 } = opts;
  const format = opts.format ?? (bits === 32 ? 3 : 1);
  const data = Buffer.alloc(frames * channels * (bits / 8));
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < channels; c++) {
      const at = (f * channels + c) * (bits / 8);
      if (bits === 16) data.writeInt16LE(Math.round(value * 32_767), at);
      else if (bits === 32) data.writeFloatLE(value, at);
      else data.writeUInt8(200, at);
    }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(format, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * (bits / 8), 28);
  h.writeUInt16LE(channels * (bits / 8), 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(opts.streamed ? 0xffffffff : data.length, 40);
  return Buffer.concat([h, data]);
}

describe('WAV decoding', () => {
  it('round-trips our own 24 kHz mono WAV', () => {
    const pcm = toPcm16(new Float32Array(2400).fill(0.25), SAMPLE_RATE);
    const decoded = decodeWav(pcmToWav(pcm));
    expect([decoded.sampleRate, decoded.channels, decoded.bits, decoded.samples.length]).toEqual([24_000, 1, 16, 2400]);
    expect(toPcm16(decoded.samples, decoded.sampleRate).equals(pcm)).toBe(true);
  });

  it('downmixes stereo and converts 48 kHz to 24 kHz, keeping the duration', () => {
    const d = decodeWav(wav({ rate: 48_000, channels: 2, bits: 16, frames: 48_000 }));
    expect(d.samples.length).toBe(48_000);
    const pcm = toPcm16(d.samples, d.sampleRate);
    expect(pcm.length / 2 / SAMPLE_RATE).toBeCloseTo(1, 3);
    expect(pcm.readInt16LE(100) / 32_767).toBeCloseTo(0.5, 2);
  });

  it('reads 32-bit float, odd rates and streamed WAVs without a data size', () => {
    expect(decodeWav(wav({ rate: 24_000, channels: 1, bits: 32, frames: 100, value: -0.5 })).samples[10]).toBeCloseTo(-0.5);
    expect(toPcm16(decodeWav(wav({ rate: 44_100, channels: 1, bits: 16, frames: 44_100 })).samples, 44_100).length / 2).toBe(24_000);
    expect(decodeWav(wav({ rate: 24_000, channels: 1, bits: 16, frames: 500, streamed: true })).samples.length).toBe(500);
  });

  it('rejects formats it cannot read', () => {
    expect(() => decodeWav(wav({ rate: 24_000, channels: 1, bits: 8, frames: 10 }))).toThrow('unsupported WAV sample format');
    expect(() => decodeWav(Buffer.from('not audio at all'))).toThrow('not a WAV file');
  });

  it('turns an audio/wav TTS response into 24 kHz PCM', () => {
    const r = new GenerateContentResponse();
    const data = wav({ rate: 48_000, channels: 1, bits: 16, frames: 96_000 }).toString('base64');
    r.candidates = [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data } }] }, finishReason: FinishReason.STOP }];
    const part = audioPart(r);
    expect(part.mimeType).toBe('audio/L16;codec=pcm;rate=24000');
    expect(part.pcm.length / 2 / SAMPLE_RATE).toBeCloseTo(2, 3);
    expect(part.source).toBe('audio/wav 48000 Hz, 1 ch, 16-bit');
  });
});
