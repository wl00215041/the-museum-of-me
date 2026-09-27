import { mulberry32 } from '../util/rng';

export interface NoteEvent {
  time: number;
  midi: number;
  velocity: number;
  duration: number;
  voice: 'piano' | 'pad';
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
