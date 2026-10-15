import type { Config } from './config';
import { gemini, sleep, withModels } from './llm';
import type { Line } from './script';
import { pcmToWav, SAMPLE_RATE } from './wav';

/** Voice one chunk with both hosts in a single multi-speaker request. Returns a WAV buffer. */
export async function speakChunk(config: Config, lines: Line[], label: string): Promise<Buffer> {
  const conversation = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
  const response = await withModels(label, config.tts.models, (model) =>
    gemini().models.generateContent({
      model,
      contents: `${config.tts.style}\n\n${conversation}`,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: config.hosts.map((h) => ({
              speaker: h.name,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: h.voice } },
            })),
          },
        },
      },
    }),
  );
  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error(`[${label}] no audio in TTS response`);
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? SAMPLE_RATE);
  if (rate !== SAMPLE_RATE) throw new Error(`[${label}] unexpected TTS sample rate ${rate}`);
  return pcmToWav(Buffer.from(part.inlineData.data, 'base64'));
}

export async function speakAll(config: Config, chunks: Line[][]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const [n, chunk] of chunks.entries()) {
    if (n > 0) await sleep(config.tts.seconds_between_requests * 1000);
    console.log(`[tts] chunk ${n + 1}/${chunks.length} (${chunk.length} lines)`);
    out.push(await speakChunk(config, chunk, `tts:${n + 1}`));
  }
  return out;
}
