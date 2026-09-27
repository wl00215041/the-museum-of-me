import { SCENE_ORDER, type DurationMode, type GalleryStop, type SceneId, type SceneSpan, type Timeline } from '../types';

export const GALLERY_SECONDS_PER_PHOTO = 3;
export const AUTO_GALLERY_MAX = 120;
export const MIN_STOP = 2;
export const MAX_PER_STOP = 3;

type FixedScene = Exclude<SceneId, 'gallery'>;

const BASE: Record<FixedScene, number> = { opening: 6, hall: 8, corridor: 8, keywords: 8, network: 8, finale: 8 };
const SHORT: Record<FixedScene, number> = { ...BASE, opening: 4, hall: 5, corridor: 5, finale: 6 };

export interface TimelineInput {
  photoCount: number;
  durationMode: DurationMode;
  hasKeywords: boolean;
}

export function enabledScenes(input: TimelineInput): SceneId[] {
  return SCENE_ORDER.filter((id) => {
    if (id === 'keywords') return input.hasKeywords && input.durationMode !== 30;
    if (id === 'network') return input.durationMode !== 30;
    return true;
  });
}

interface GalleryPlan {
  seconds: number;
  perStop: number;
  shown: number;
}

function planGallery(n: number, mode: DurationMode, fixedSeconds: number): GalleryPlan {
  if (mode === 'auto') {
    const wanted = n * GALLERY_SECONDS_PER_PHOTO;
    return { seconds: Math.min(wanted, AUTO_GALLERY_MAX), perStop: wanted <= AUTO_GALLERY_MAX ? 1 : 2, shown: n };
  }
  const seconds = mode - fixedSeconds;
  const perStop = [1, 2, 3].find((p) => seconds / Math.ceil(n / p) >= MIN_STOP);
  if (perStop !== undefined) return { seconds, perStop, shown: n };
  return { seconds, perStop: MAX_PER_STOP, shown: Math.min(n, Math.floor(seconds / MIN_STOP) * MAX_PER_STOP) };
}

export function buildTimeline(input: TimelineInput): Timeline {
  const n = input.photoCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`photoCount must be a positive integer, got ${n}`);

  const ids = enabledScenes(input);
  const table = input.durationMode === 30 ? SHORT : BASE;
  const fixedSeconds = ids.reduce((sum, id) => (id === 'gallery' ? sum : sum + table[id]), 0);
  const gallery = planGallery(n, input.durationMode, fixedSeconds);

  const scenes: SceneSpan[] = [];
  let cursor = 0;
  for (const id of ids) {
    const seconds = id === 'gallery' ? gallery.seconds : table[id];
    scenes.push({ id, start: cursor, end: cursor + seconds });
    cursor += seconds;
  }

  const span = scenes.find((s) => s.id === 'gallery')!;
  const stopCount = Math.ceil(gallery.shown / gallery.perStop);
  const stopSeconds = gallery.seconds / stopCount;
  const galleryStops: GalleryStop[] = Array.from({ length: stopCount }, (_, k) => {
    const first = k * gallery.perStop;
    const last = Math.min(first + gallery.perStop, gallery.shown);
    return {
      start: span.start + k * stopSeconds,
      end: k === stopCount - 1 ? span.end : span.start + (k + 1) * stopSeconds,
      photoIndices: Array.from({ length: last - first }, (_, j) => first + j),
    };
  });

  return { total: cursor, scenes, galleryStops };
}
