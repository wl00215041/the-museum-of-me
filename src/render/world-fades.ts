import { findSegment } from '../plan/sequence';
import type { Sequence } from '../types';
import { lerp, smoothstep } from '../util/math';

export interface Fade {
  white: boolean;
  amount: number;
}

/** One take: fade in from black, fade the last scene out to black, cut to the card in black, fade the card in. */
export function worldFadeAt(sequence: Sequence, t: number): Fade {
  let amount = 1 - smoothstep(0, 1, t);
  const ending = findSegment(sequence, 'ending');
  if (ending) {
    const before = sequence.segments[sequence.segments.indexOf(ending) - 1];
    if (t < ending.start && before) {
      const d = before.end - before.start;
      amount = Math.max(amount, smoothstep(before.end - Math.min(2.5, 0.15 * d), before.end, t));
    } else if (t >= ending.start) {
      amount = Math.max(amount, 1 - smoothstep(ending.start, ending.start + 1.2, t));
    }
  }
  amount = Math.max(amount, smoothstep(sequence.total - 1.2, sequence.total, t));
  return { white: false, amount };
}

/** N8AO strength for a bloom level: strong in the white rooms, soft where things glow — continuous (review I3). */
/**
 * Depth-of-field strength: full through the gallery, weak from the robot room on so the floating photos stay sharp,
 * and nearly off once the network has grown so every bubble can be read.
 */
export function dofScaleAt(sequence: Sequence, t: number): number {
  const robots = findSegment(sequence, 'robots');
  const network = findSegment(sequence, 'network');
  let s = 1.5;
  if (robots) s -= 1.0 * smoothstep(robots.start, robots.start + 2, t);
  if (network) s -= 0.3 * smoothstep(network.start, network.start + 0.25 * (network.end - network.start), t);
  return s;
}

export function aoIntensityFor(glow: number): number {
  return lerp(2.2, 1.0, smoothstep(0.2, 1.1, glow));
}
