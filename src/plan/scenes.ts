import { pickSpread, shuffle } from '../stage/placement';
import { SCENE_IDS, type SceneId, type Scenes, type SegmentId, type Sequence } from '../types';
import { mulberry32 } from '../util/rng';

/** The scenes a user can fill (spec §3), in film order. */
export const SCENES: Record<SceneId, { name: string; capacity: number; segment: SegmentId }> = {
  friends: { name: 'Friends 畫布', capacity: 12, segment: 'portraits' },
  photos: { name: 'Photos 照片牆', capacity: 160, segment: 'photos' },
  location: { name: 'Location 燈箱', capacity: 3, segment: 'moments' },
  tvs: { name: 'Likes 古早電視', capacity: 7, segment: 'likes' },
  grid: { name: 'Photos 5.2 網格牆', capacity: 60, segment: 'likes' },
  videos: { name: 'Videos 影像牆', capacity: 1, segment: 'likes' },
  floaters: { name: '機器手臂房漂浮照片', capacity: 260, segment: 'robots' },
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const unique = (xs: number[]) => [...new Set(xs)];

/** The automatic choice for n photos (what the gallery picked before scenes could be edited). */
export function defaultScenes(n: number, seed: number): Scenes {
  const rnd = mulberry32(seed ^ 0x5ce9e);
  const grid = shuffle(n, rnd);
  const floaters = shuffle(n, rnd);
  return {
    friends: pickSpread(n, Math.min(SCENES.friends.capacity, n)),
    photos: n <= SCENES.photos.capacity ? range(n) : pickSpread(n, SCENES.photos.capacity),
    location: pickSpread(n, Math.min(SCENES.location.capacity, n), 0.37),
    tvs: unique(Array.from({ length: SCENES.tvs.capacity }, (_, i) => (5 * i + 2) % n)),
    grid: grid.slice(0, Math.min(SCENES.grid.capacity, n)),
    videos: pickSpread(n, 1, 0.61),
    floaters: floaters.slice(0, Math.min(SCENES.floaters.capacity, n)),
  };
}

/** The user's lists cleaned up: valid, unique, within capacity; an empty scene falls back to the default. */
export function resolveScenes(scenes: Partial<Scenes> | undefined, n: number, seed: number): Scenes {
  const fallback = defaultScenes(n, seed);
  const out = {} as Scenes;
  for (const id of SCENE_IDS) {
    const seen = new Set<number>();
    const list: number[] = [];
    for (const i of scenes?.[id] ?? []) {
      if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) continue;
      seen.add(i);
      list.push(i);
      if (list.length === SCENES[id].capacity) break;
    }
    out[id] = list.length > 0 ? list : fallback[id];
  }
  return out;
}

/** Scenes that appear in a cut. */
export function scenesInCut(sequence: Sequence): Set<SceneId> {
  const present = new Set(sequence.segments.map((s) => s.id));
  return new Set(SCENE_IDS.filter((id) => present.has(SCENES[id].segment)));
}
