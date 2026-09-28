import { SHOT_ORDER, type LengthMode, type ShotId, type ShotSpan, type Storyboard } from '../types';
import { clamp } from '../util/math';

export const BASE_SECONDS: Record<ShotId, number> = {
  title: 6, intro: 5, exhibition: 7, portraits: 8, photos: 10, moments: 12, words: 14,
  likes: 9, videos: 9, robots: 22, mosaic: 10, network: 16, ending: 7,
};

export const MUSIC_MIN = 30;
export const MUSIC_MAX = 300;

type Preset = 30 | 60 | 90 | 120;

const PRESET_SHOTS: Record<Exclude<Preset, 120>, readonly ShotId[]> = {
  30: ['title', 'exhibition', 'photos', 'mosaic', 'ending'],
  60: ['title', 'intro', 'exhibition', 'portraits', 'photos', 'words', 'mosaic', 'network', 'ending'],
  90: ['title', 'intro', 'exhibition', 'portraits', 'photos', 'moments', 'words', 'robots', 'mosaic', 'network', 'ending'],
};

export interface StoryboardInput {
  photoCount: number;
  lengthMode: LengthMode;
  musicDuration: number | null;
}

export const photosSeconds = (n: number): number => Math.min(30, 10 + 0.4 * n);

export function presetShots(preset: Preset): ShotId[] {
  if (preset === 120) return [...SHOT_ORDER];
  const allowed = new Set(PRESET_SHOTS[preset]);
  return SHOT_ORDER.filter((id) => allowed.has(id));
}

export function shotsForLength(seconds: number): ShotId[] {
  return presetShots(seconds < 45 ? 30 : seconds < 75 ? 60 : seconds < 105 ? 90 : 120);
}

export function buildStoryboard(input: StoryboardInput): Storyboard {
  const n = input.photoCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`photoCount must be a positive integer, got ${n}`);
  const base = (id: ShotId) => (id === 'photos' ? photosSeconds(n) : BASE_SECONDS[id]);

  let ids: ShotId[];
  let target: number | null;
  if (input.lengthMode === 'auto') {
    ids = [...SHOT_ORDER];
    target = null;
  } else if (input.lengthMode === 'music') {
    if (!input.musicDuration || input.musicDuration <= 0) throw new Error('music length mode needs a music duration');
    target = clamp(input.musicDuration, MUSIC_MIN, MUSIC_MAX);
    ids = shotsForLength(target);
  } else {
    target = input.lengthMode;
    ids = presetShots(input.lengthMode);
  }

  const sum = ids.reduce((s, id) => s + base(id), 0);
  const scale = target === null ? 1 : target / sum;
  let cursor = 0;
  const shots: ShotSpan[] = ids.map((id) => {
    const span = { id, start: cursor, end: cursor + base(id) * scale };
    cursor = span.end;
    return span;
  });
  const total = target ?? cursor;
  shots[shots.length - 1].end = total;
  return { total, shots };
}

/** Index of the shot whose span contains t (clamped to the first/last shot). */
export function shotIndexAt(storyboard: Storyboard, t: number): number {
  const { shots } = storyboard;
  let lo = 0;
  let hi = shots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shots[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
