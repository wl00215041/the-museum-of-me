import { SEGMENT_ORDER, type LengthMode, type Segment, type SegmentId, type Sequence } from '../types';
import { clamp } from '../util/math';

/** Base seconds per segment, measured on the original film. */
export const SEQUENCE_BASE: Record<SegmentId, number> = {
  title: 5, exhibition: 10, intro: 7, portraits: 16, photos: 15, moments: 10, words: 29,
  likes: 14, videos: 16, robots: 28, dive: 12, mosaic: 12, network: 24, ending: 8,
};

export const photosSegmentSeconds = (n: number): number => clamp(9 + 0.3 * n, 12, 24);

type Preset = 30 | 60 | 90 | 120;

const PRESETS: Record<Exclude<Preset, 120>, readonly SegmentId[]> = {
  30: ['title', 'exhibition', 'photos', 'robots', 'dive', 'mosaic', 'ending'],
  60: ['title', 'exhibition', 'intro', 'portraits', 'photos', 'words', 'robots', 'dive', 'mosaic', 'network', 'ending'],
  90: ['title', 'exhibition', 'intro', 'portraits', 'photos', 'moments', 'words', 'likes', 'robots', 'dive', 'mosaic', 'network', 'ending'],
};

export interface SequenceInput {
  photoCount: number;
  lengthMode: LengthMode;
  musicDuration: number | null;
}

export function presetSegments(preset: Preset): SegmentId[] {
  if (preset === 120) return [...SEGMENT_ORDER];
  const allowed = new Set(PRESETS[preset]);
  return SEGMENT_ORDER.filter((id) => allowed.has(id));
}

export function segmentsForLength(seconds: number): SegmentId[] {
  return presetSegments(seconds < 45 ? 30 : seconds < 75 ? 60 : seconds < 105 ? 90 : 120);
}

export function buildSequence(input: SequenceInput): Sequence {
  const n = input.photoCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`photoCount must be a positive integer, got ${n}`);
  const base = (id: SegmentId) => (id === 'photos' ? photosSegmentSeconds(n) : SEQUENCE_BASE[id]);
  let ids: SegmentId[];
  let target: number | null;
  if (input.lengthMode === 'auto') {
    ids = [...SEGMENT_ORDER];
    target = null;
  } else if (input.lengthMode === 'music') {
    if (!input.musicDuration || input.musicDuration <= 0) throw new Error('music length mode needs a music duration');
    target = clamp(input.musicDuration, 30, 300);
    ids = segmentsForLength(target);
  } else {
    target = input.lengthMode;
    ids = presetSegments(input.lengthMode);
  }
  const sum = ids.reduce((s, id) => s + base(id), 0);
  const scale = target === null ? 1 : target / sum;
  let cursor = 0;
  const segments: Segment[] = ids.map((id) => {
    const segment = { id, start: cursor, end: cursor + base(id) * scale };
    cursor = segment.end;
    return segment;
  });
  const total = target ?? cursor;
  segments[segments.length - 1].end = total;
  return { total, segments };
}

export function segmentIndexAt(sequence: Sequence, t: number): number {
  const { segments } = sequence;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const findSegment = (sequence: Sequence, id: SegmentId): Segment | null => sequence.segments.find((s) => s.id === id) ?? null;

export function requireSegment(sequence: Sequence, id: SegmentId): Segment {
  const segment = findSegment(sequence, id);
  if (!segment) throw new Error(`sequence has no "${id}" segment`);
  return segment;
}

export const localU = (segment: Segment, t: number): number => clamp((t - segment.start) / (segment.end - segment.start), 0, 1);
