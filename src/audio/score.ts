import { mulberry32 } from '../util/rng';

export interface NoteEvent {
  time: number;
  midi: number;
  velocity: number;
  duration: number;
  voice: 'piano' | 'pad' | 'bell';
}

export const BPM = 72;
/** Seconds at the end kept free of new notes so reverb and the fade-out can ring out. */
export const TAIL = 3;

const BEAT = 60 / BPM;
const BAR = 4 * BEAT;

/** Cmaj7 – Am7 – Fmaj7 – G, voiced bass first. */
const PROGRESSION = [
  [48, 55, 59, 64, 67],
  [45, 52, 55, 60, 64],
  [41, 48, 52, 57, 60],
  [43, 50, 55, 59, 62],
];
const MELODY = [72, 74, 76, 79, 81, 84];

export function composeScore(duration: number, seed: number): NoteEvent[] {
  const rnd = mulberry32(seed);
  const end = duration - TAIL;
  const events: NoteEvent[] = [];
  for (let bar = 0; bar * BAR < end; bar++) {
    const t0 = bar * BAR;
    const chord = PROGRESSION[bar % PROGRESSION.length];
    for (const midi of chord.slice(1, 4)) {
      events.push({ time: t0, midi, velocity: 0.16, duration: BAR * 1.05, voice: 'pad' });
    }
    events.push({ time: t0, midi: chord[0], velocity: 0.5, duration: BAR, voice: 'piano' });
    for (let e = 0; e < 8; e++) {
      const skip = e > 0 && rnd() < 0.25;
      if (skip) continue;
      events.push({
        time: t0 + (e * BEAT) / 2,
        midi: chord[1 + ((e + bar) % 4)],
        velocity: 0.26 + rnd() * 0.1,
        duration: BEAT * 1.5,
        voice: 'piano',
      });
    }
    if (bar >= 2) {
      for (const beat of [0, 2]) {
        if (rnd() < 0.6) {
          events.push({
            time: t0 + beat * BEAT,
            midi: MELODY[Math.floor(rnd() * MELODY.length)],
            velocity: 0.34,
            duration: BEAT * 2,
            voice: 'piano',
          });
        }
      }
    }
  }
  return events.filter((e) => e.time < end).sort((a, b) => a.time - b.time);
}

export const AIRY_BPM = 60;
const AIRY_BEAT = 60 / AIRY_BPM;
const AIRY_BAR = 4 * AIRY_BEAT;

/** Fmaj9 – C/E – Dm9 – B♭maj7(#11), bass first; an original progression, not taken from any existing piece. */
const AIRY_CHORDS = [
  [41, 48, 55, 57, 64, 67],
  [40, 48, 55, 60, 64, 67],
  [38, 45, 53, 57, 60, 64],
  [34, 46, 53, 57, 62, 64],
];
const BELL = [76, 79, 81, 84, 86, 88];

/** Slow, sparse, reverberant piano with pads and bell-like high notes. */
export function composeAiryScore(duration: number, seed: number): NoteEvent[] {
  const rnd = mulberry32(seed ^ 0xa1b2);
  const end = duration - TAIL;
  const events: NoteEvent[] = [];
  for (let bar = 0; bar * AIRY_BAR < end; bar++) {
    const t0 = bar * AIRY_BAR;
    const chord = AIRY_CHORDS[bar % AIRY_CHORDS.length];
    for (const midi of chord.slice(1, 4)) events.push({ time: t0, midi, velocity: 0.12, duration: AIRY_BAR * 1.1, voice: 'pad' });
    events.push({ time: t0, midi: chord[0], velocity: 0.42, duration: AIRY_BAR, voice: 'piano' });
    for (const [beat, idx] of [[0.5, 2], [1.5, 3], [2, 4], [3, 5]] as const) {
      if (rnd() < 0.8) {
        events.push({ time: t0 + beat * AIRY_BEAT, midi: chord[idx], velocity: 0.2 + rnd() * 0.08, duration: AIRY_BEAT * 2.5, voice: 'piano' });
      }
    }
    if (bar >= 1) {
      for (const beat of [1, 2.5]) {
        if (rnd() < 0.55) {
          events.push({ time: t0 + beat * AIRY_BEAT, midi: BELL[Math.floor(rnd() * BELL.length)], velocity: 0.22, duration: AIRY_BEAT * 3, voice: 'bell' });
        }
      }
    }
  }
  return events.filter((e) => e.time < end).sort((a, b) => a.time - b.time);
}
