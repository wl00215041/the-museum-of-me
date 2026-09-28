import type { NoteEvent } from './score';

export const CHUNK_SECONDS = 16;
/** Longest release + reverb tail a chunk has to keep rendering past its end. */
export const RING_SECONDS = 6;

export interface NoteChunk {
  start: number;
  end: number;
  events: NoteEvent[];
}

export function chunkNotes(events: NoteEvent[], duration: number, chunk = CHUNK_SECONDS): NoteChunk[] {
  const count = Math.max(1, Math.ceil(duration / chunk));
  const chunks: NoteChunk[] = Array.from({ length: count }, (_, k) => ({
    start: k * chunk,
    end: Math.min(duration, (k + 1) * chunk),
    events: [],
  }));
  for (const ev of events) chunks[Math.min(count - 1, Math.max(0, Math.floor(ev.time / chunk)))].events.push(ev);
  return chunks;
}

export function overlapAdd(dst: Float32Array, src: Float32Array, offset: number): void {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) dst[offset + i] += src[i];
}

/** Master gain with a linear fade in/out, then a soft knee above 0.9 so nothing reaches full scale. */
export function applyMaster(channels: Float32Array[], sampleRate: number, fadeIn: number, tail: number, level: number): void {
  const inEnd = fadeIn * sampleRate;
  for (const data of channels) {
    const outStart = data.length - tail * sampleRate;
    for (let i = 0; i < data.length; i++) {
      const env = Math.min(1, i / inEnd, Math.max(0, (data.length - 1 - i) / (data.length - 1 - outStart)));
      const x = data[i] * level * env;
      const a = Math.abs(x);
      data[i] = a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.099 * Math.tanh((a - 0.9) / 0.099));
    }
  }
}
