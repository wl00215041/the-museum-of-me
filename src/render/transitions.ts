import type { ShotId, Storyboard } from '../types';
import { smoothstep } from '../util/math';

export type Entry = 'fromWhite' | 'continue' | 'cut' | 'blackDip' | 'whiteDip';

/** How each shot is entered (spec §3, 「轉場」 column). */
export const ENTRY: Record<ShotId, Entry> = {
  title: 'fromWhite', intro: 'continue', exhibition: 'continue', portraits: 'continue', photos: 'continue',
  moments: 'blackDip', words: 'cut', likes: 'cut', videos: 'cut', robots: 'whiteDip',
  mosaic: 'blackDip', network: 'cut', ending: 'blackDip',
};

export const DIP = 0.6;
export const INTRO_FADE = 1.2;
export const OUTRO_FADE = 1.5;

export interface Fade {
  white: boolean;
  amount: number;
}

/** Fade colour and strength at t; a dip peaks exactly on the cut, hiding the change of set. */
export function fadeAt(storyboard: Storyboard, t: number): Fade {
  let best: Fade = { white: false, amount: 0 };
  const consider = (white: boolean, amount: number) => {
    if (amount > best.amount) best = { white, amount };
  };
  consider(true, 1 - smoothstep(0, INTRO_FADE, t));
  for (const shot of storyboard.shots.slice(1)) {
    const entry = ENTRY[shot.id];
    if (entry === 'blackDip' || entry === 'whiteDip') consider(entry === 'whiteDip', 1 - smoothstep(0, DIP, Math.abs(t - shot.start)));
  }
  consider(false, smoothstep(storyboard.total - OUTRO_FADE, storyboard.total, t));
  return best;
}
