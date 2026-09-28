import type { MusicStyle } from '../types';
import { mulberry32 } from '../util/rng';
import { TAIL, composeAiryScore, composeScore, type NoteEvent } from './score';

export const SAMPLE_RATE = 48000;
const FADE_IN = 0.5;

const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

function impulseResponse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const rnd = mulberry32(seed ^ 0x5eed);
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (rnd() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function playPartials(ctx: BaseAudioContext, out: AudioNode, ev: NoteEvent, partials: readonly (readonly [number, number])[], decay: number, gain: number): void {
  const f = midiToHz(ev.midi);
  const stopAt = ev.time + ev.duration + decay;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, ev.time);
  env.gain.linearRampToValueAtTime(ev.velocity, ev.time + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0008, stopAt);
  env.connect(out);
  partials.forEach(([ratio, amp], i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    osc.detune.value = (i + 1) * 0.7;
    const g = ctx.createGain();
    g.gain.value = amp * gain;
    osc.connect(g).connect(env);
    osc.start(ev.time);
    osc.stop(stopAt + 0.05);
  });
}

const PIANO = [[1, 1], [2, 0.45], [3, 0.18], [4, 0.08]] as const;
const BELL = [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const;

function playPad(ctx: BaseAudioContext, out: AudioNode, ev: NoteEvent): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  const env = ctx.createGain();
  const release = 1.5;
  env.gain.setValueAtTime(0, ev.time);
  env.gain.linearRampToValueAtTime(ev.velocity, ev.time + 1.2);
  env.gain.setValueAtTime(ev.velocity, ev.time + ev.duration);
  env.gain.linearRampToValueAtTime(0, ev.time + ev.duration + release);
  filter.connect(env).connect(out);
  for (const detune of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToHz(ev.midi);
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    osc.connect(g).connect(filter);
    osc.start(ev.time);
    osc.stop(ev.time + ev.duration + release + 0.05);
  }
}

function masterChain(ctx: BaseAudioContext, duration: number, level: number): GainNode {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(level, FADE_IN);
  master.gain.setValueAtTime(level, Math.max(FADE_IN, duration - TAIL));
  master.gain.linearRampToValueAtTime(0, duration);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);
  return master;
}

export async function synthesizeSoundtrack(duration: number, seed: number, style: 'calm' | 'airy' = 'calm'): Promise<AudioBuffer> {
  const airy = style === 'airy';
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = masterChain(ctx, duration, 0.8);
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = airy ? 0.65 : 0.8;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulseResponse(ctx, airy ? 4.5 : 3.2, seed);
  const wet = ctx.createGain();
  wet.gain.value = airy ? 0.5 : 0.35;
  bus.connect(dry).connect(master);
  bus.connect(reverb).connect(wet).connect(master);
  for (const ev of airy ? composeAiryScore(duration, seed) : composeScore(duration, seed)) {
    if (ev.voice === 'pad') playPad(ctx, bus, ev);
    else if (ev.voice === 'bell') playPartials(ctx, bus, ev, BELL, 2.5, 0.3);
    else playPartials(ctx, bus, ev, PIANO, 1.2 + (96 - ev.midi) / 40, 0.35);
  }
  return ctx.startRendering();
}

async function decode(file: File): Promise<AudioBuffer> {
  return new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(await file.arrayBuffer());
}

export async function probeAudioDuration(file: File): Promise<number> {
  return (await decode(file)).duration;
}

export async function fitUploadedAudio(file: File, duration: number): Promise<AudioBuffer> {
  const decoded = await decode(file);
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.loop = decoded.duration < duration;
  source.connect(masterChain(ctx, duration, 1));
  source.start(0);
  return ctx.startRendering();
}

export async function buildSoundtrack(
  music: { style: MusicStyle; file: File | null },
  duration: number,
  seed: number,
): Promise<{ buffer: AudioBuffer; warning: string | null }> {
  if (music.style !== 'upload') return { buffer: await synthesizeSoundtrack(duration, seed, music.style), warning: null };
  if (!music.file) return { buffer: await synthesizeSoundtrack(duration, seed, 'airy'), warning: '未選擇音樂檔，已改用內建配樂' };
  try {
    return { buffer: await fitUploadedAudio(music.file, duration), warning: null };
  } catch {
    return { buffer: await synthesizeSoundtrack(duration, seed, 'airy'), warning: `無法讀取音樂檔「${music.file.name}」，已改用內建配樂` };
  }
}
