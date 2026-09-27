import { describe, expect, it } from 'vitest';
import { buildTimeline, enabledScenes } from '../../src/plan/timeline';
import type { DurationMode, Timeline } from '../../src/types';

const durations = (tl: Timeline) => Object.fromEntries(tl.scenes.map((s) => [s.id, +(s.end - s.start).toFixed(6)]));

function expectInvariants(tl: Timeline, n: number): void {
  expect(tl.scenes[0].start).toBe(0);
  for (let i = 1; i < tl.scenes.length; i++) expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end, 9);
  expect(tl.scenes.at(-1)!.end).toBeCloseTo(tl.total, 9);
  const gallery = tl.scenes.find((s) => s.id === 'gallery')!;
  expect(tl.galleryStops[0].start).toBeCloseTo(gallery.start, 9);
  expect(tl.galleryStops.at(-1)!.end).toBeCloseTo(gallery.end, 9);
  for (let i = 1; i < tl.galleryStops.length; i++) {
    expect(tl.galleryStops[i].start).toBeCloseTo(tl.galleryStops[i - 1].end, 9);
  }
  const shown = tl.galleryStops.flatMap((s) => s.photoIndices);
  expect(new Set(shown).size).toBe(shown.length);
  for (const i of shown) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(n);
  }
  for (const s of tl.galleryStops) {
    expect(s.photoIndices.length).toBeGreaterThan(0);
    expect(s.photoIndices.length).toBeLessThanOrEqual(3);
  }
}

describe('buildTimeline', () => {
  it('auto mode, 10 photos with keywords uses every scene and 3 s per photo', () => {
    const tl = buildTimeline({ photoCount: 10, durationMode: 'auto', hasKeywords: true });
    expect(tl.scenes.map((s) => s.id)).toEqual(['opening', 'hall', 'corridor', 'gallery', 'keywords', 'network', 'finale']);
    expect(tl.total).toBe(76);
    expect(tl.galleryStops).toHaveLength(10);
    tl.galleryStops.forEach((s, i) => {
      expect(s.photoIndices).toEqual([i]);
      expect(s.end - s.start).toBeCloseTo(3, 9);
    });
    expectInvariants(tl, 10);
  });

  it('auto mode, 40 photos sits exactly at the 120 s cap with single stops', () => {
    const tl = buildTimeline({ photoCount: 40, durationMode: 'auto', hasKeywords: false });
    expect(durations(tl).gallery).toBe(120);
    expect(tl.galleryStops).toHaveLength(40);
  });

  it('auto mode caps the gallery at 120 s and pairs photos above 40', () => {
    const tl = buildTimeline({ photoCount: 60, durationMode: 'auto', hasKeywords: true });
    expect(durations(tl).gallery).toBe(120);
    expect(tl.galleryStops).toHaveLength(30);
    tl.galleryStops.forEach((s) => {
      expect(s.photoIndices).toHaveLength(2);
      expect(s.end - s.start).toBeGreaterThanOrEqual(3);
    });
    expectInvariants(tl, 60);
  });

  it('30 s mode drops keywords and network and uses the short durations', () => {
    const tl = buildTimeline({ photoCount: 10, durationMode: 30, hasKeywords: true });
    expect(tl.scenes.map((s) => s.id)).toEqual(['opening', 'hall', 'corridor', 'gallery', 'finale']);
    expect(durations(tl)).toEqual({ opening: 4, hall: 5, corridor: 5, gallery: 10, finale: 6 });
    expect(tl.total).toBe(30);
    expect(tl.galleryStops).toHaveLength(5);
    expect(tl.galleryStops.every((s) => s.photoIndices.length === 2)).toBe(true);
  });

  it('30 s mode with 60 photos shows only the first 15 in the gallery', () => {
    const tl = buildTimeline({ photoCount: 60, durationMode: 30, hasKeywords: false });
    expect(tl.galleryStops).toHaveLength(5);
    expect(tl.galleryStops.flatMap((s) => s.photoIndices)).toEqual(Array.from({ length: 15 }, (_, i) => i));
  });

  it('skips the keyword room when there are no keywords', () => {
    const tl = buildTimeline({ photoCount: 12, durationMode: 60, hasKeywords: false });
    expect(tl.scenes.map((s) => s.id)).not.toContain('keywords');
    expect(durations(tl).gallery).toBe(22);
    expect(tl.galleryStops).toHaveLength(6);
  });

  it('fixed modes always total exactly the chosen length', () => {
    for (const mode of [30, 60, 90, 120] as const) {
      for (const n of [1, 3, 17, 60]) {
        for (const hasKeywords of [true, false]) {
          expect(buildTimeline({ photoCount: n, durationMode: mode, hasKeywords }).total).toBeCloseTo(mode, 9);
        }
      }
    }
  });

  it('holds its invariants across photo counts and modes', () => {
    const modes: DurationMode[] = ['auto', 30, 60, 90, 120];
    for (const n of [1, 2, 3, 7, 13, 29, 40, 41, 59, 60]) {
      for (const durationMode of modes) {
        for (const hasKeywords of [true, false]) {
          expectInvariants(buildTimeline({ photoCount: n, durationMode, hasKeywords }), n);
        }
      }
    }
  });

  it('rejects non-positive or fractional photo counts', () => {
    expect(() => buildTimeline({ photoCount: 0, durationMode: 'auto', hasKeywords: false })).toThrow();
    expect(() => buildTimeline({ photoCount: 2.5, durationMode: 'auto', hasKeywords: false })).toThrow();
  });
});

describe('enabledScenes', () => {
  it('auto mode without keywords only drops the keyword room', () => {
    expect(enabledScenes({ photoCount: 5, durationMode: 'auto', hasKeywords: false })).toEqual([
      'opening', 'hall', 'corridor', 'gallery', 'network', 'finale',
    ]);
  });
});
