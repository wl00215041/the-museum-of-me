import { smoothstep } from '../util/math';

export const INTRO_FADE = 1.6;

/** White-out and end-card opacity at time t; the finale dwell covers the last ~3.6 s. */
export function fadesAt(t: number, total: number): { white: number; card: number } {
  const intro = 1 - smoothstep(0, INTRO_FADE, t);
  const outro = smoothstep(total - 3.4, total - 2.2, t);
  return { white: Math.max(intro, outro), card: smoothstep(total - 2.4, total - 1.4, t) };
}
