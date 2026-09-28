import { describe, expect, it } from 'vitest';
import {
  buildSequence, findSegment, localU, photosSegmentSeconds, presetSegments, requireSegment, segmentIndexAt, segmentsForLength,
} from '../../src/plan/sequence';
import { SEGMENT_ORDER, type LengthMode, type Sequence } from '../../src/types';

const ids = (s: Sequence) => s.segments.map((x) => x.id);

function expectContiguous(s: Sequence): void {
  expect(s.segments[0].start).toBe(0);
  for (let i = 1; i < s.segments.length; i++) expect(s.segments[i].start).toBeCloseTo(s.segments[i - 1].end, 9);
  expect(s.segments.at(-1)!.end).toBe(s.total);
}

describe('buildSequence', () => {
  it('auto mode follows the original film timing', () => {
    const s = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
    expect(ids(s)).toEqual([...SEGMENT_ORDER]);
    expect(s.total).toBeCloseTo(206, 9);
    const ex = requireSegment(s, 'exhibition');
    expect(ex.start + 0.55 * (ex.end - ex.start)).toBeCloseTo(10.5, 9);
    expectContiguous(s);
  });

  it('scales the photo wall with the photo count, within 12–24 s', () => {
    expect(photosSegmentSeconds(3)).toBe(12);
    expect(photosSegmentSeconds(20)).toBe(15);
    expect(photosSegmentSeconds(500)).toBe(24);
  });

  it('every fixed length keeps robots, dive and mosaic together and totals exactly', () => {
    for (const [mode, count] of [[30, 7], [60, 11], [90, 13], [120, 14]] as const) {
      const s = buildSequence({ photoCount: 12, lengthMode: mode, musicDuration: null });
      expect(s.total).toBe(mode);
      expect(s.segments).toHaveLength(count);
      for (const id of ['title', 'exhibition', 'photos', 'robots', 'dive', 'mosaic', 'ending'] as const) expect(ids(s)).toContain(id);
      expectContiguous(s);
    }
    expect(ids(buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null }))).toEqual(['title', 'exhibition', 'photos', 'robots', 'dive', 'mosaic', 'ending']);
  });

  it('music mode clamps to 30–300 s and picks presets by threshold', () => {
    for (const [music, total, count] of [[10, 30, 7], [70, 70, 11], [100, 100, 13], [500, 300, 14]] as const) {
      const s = buildSequence({ photoCount: 12, lengthMode: 'music', musicDuration: music });
      expect(s.total).toBe(total);
      expect(s.segments).toHaveLength(count);
    }
  });

  it('rejects bad input', () => {
    expect(() => buildSequence({ photoCount: 0, lengthMode: 'auto', musicDuration: null })).toThrow();
    expect(() => buildSequence({ photoCount: 5, lengthMode: 'music', musicDuration: null })).toThrow();
  });

  it('keeps the original order in every mode', () => {
    const modes: LengthMode[] = ['auto', 30, 60, 90, 120];
    for (const lengthMode of modes) {
      const order = ids(buildSequence({ photoCount: 9, lengthMode, musicDuration: null })).map((id) => SEGMENT_ORDER.indexOf(id));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });
});

describe('helpers', () => {
  const s = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null });

  it('segmentIndexAt, findSegment, requireSegment and localU', () => {
    expect(segmentIndexAt(s, -1)).toBe(0);
    expect(segmentIndexAt(s, 5)).toBe(1);
    expect(segmentIndexAt(s, 1e6)).toBe(s.segments.length - 1);
    expect(findSegment(buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null }), 'words')).toBeNull();
    expect(() => requireSegment(buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null }), 'words')).toThrow();
    const ex = requireSegment(s, 'exhibition');
    expect(localU(ex, ex.start - 1)).toBe(0);
    expect(localU(ex, (ex.start + ex.end) / 2)).toBe(0.5);
    expect(localU(ex, ex.end + 1)).toBe(1);
  });

  it('presets match the thresholds', () => {
    expect(segmentsForLength(44)).toEqual(presetSegments(30));
    expect(segmentsForLength(74)).toEqual(presetSegments(60));
    expect(segmentsForLength(104)).toEqual(presetSegments(90));
    expect(segmentsForLength(105)).toEqual(presetSegments(120));
  });
});
