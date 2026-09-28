import { describe, expect, it } from 'vitest';
import { buildStoryboard, photosSeconds, presetShots, shotIndexAt, shotsForLength } from '../../src/plan/storyboard';
import { SHOT_ORDER, type LengthMode, type Storyboard } from '../../src/types';

const ids = (sb: Storyboard) => sb.shots.map((s) => s.id);

function expectContiguous(sb: Storyboard): void {
  expect(sb.shots[0].start).toBe(0);
  for (let i = 1; i < sb.shots.length; i++) expect(sb.shots[i].start).toBeCloseTo(sb.shots[i - 1].end, 9);
  expect(sb.shots.at(-1)!.end).toBe(sb.total);
  const order = ids(sb).map((id) => SHOT_ORDER.indexOf(id));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
}

describe('buildStoryboard', () => {
  it('auto mode plays every shot at its base length', () => {
    const sb = buildStoryboard({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
    expect(ids(sb)).toEqual([...SHOT_ORDER]);
    expect(sb.total).toBeCloseTo(143, 9);
    expect(sb.shots.find((s) => s.id === 'photos')!.end - sb.shots.find((s) => s.id === 'photos')!.start).toBeCloseTo(18, 9);
    expectContiguous(sb);
  });

  it('caps the photo wall at 30 s for large libraries', () => {
    expect(photosSeconds(500)).toBe(30);
    expect(buildStoryboard({ photoCount: 500, lengthMode: 'auto', musicDuration: null }).total).toBeCloseTo(155, 9);
  });

  it('fixed lengths pick the preset shots and scale them to the exact length', () => {
    for (const [mode, count] of [[30, 5], [60, 9], [90, 11], [120, 13]] as const) {
      const sb = buildStoryboard({ photoCount: 40, lengthMode: mode, musicDuration: null });
      expect(sb.total).toBe(mode);
      expect(sb.shots).toHaveLength(count);
      expectContiguous(sb);
    }
    expect(ids(buildStoryboard({ photoCount: 3, lengthMode: 30, musicDuration: null }))).toEqual(['title', 'exhibition', 'photos', 'mosaic', 'ending']);
  });

  it('keeps the relative proportions of base lengths when scaling', () => {
    const sb = buildStoryboard({ photoCount: 20, lengthMode: 30, musicDuration: null });
    const title = sb.shots[0];
    const mosaic = sb.shots.find((s) => s.id === 'mosaic')!;
    expect((mosaic.end - mosaic.start) / (title.end - title.start)).toBeCloseTo(10 / 6, 9);
  });

  it('music mode follows the clamped music length and picks shots by threshold', () => {
    const cases: [number, number, number][] = [[20, 30, 5], [44, 44, 5], [70, 70, 9], [100, 100, 11], [200, 200, 13], [400, 300, 13]];
    for (const [music, total, count] of cases) {
      const sb = buildStoryboard({ photoCount: 12, lengthMode: 'music', musicDuration: music });
      expect(sb.total).toBe(total);
      expect(sb.shots).toHaveLength(count);
    }
  });

  it('rejects music mode without a music duration and bad photo counts', () => {
    expect(() => buildStoryboard({ photoCount: 5, lengthMode: 'music', musicDuration: null })).toThrow();
    expect(() => buildStoryboard({ photoCount: 0, lengthMode: 'auto', musicDuration: null })).toThrow();
    expect(() => buildStoryboard({ photoCount: 1.5, lengthMode: 'auto', musicDuration: null })).toThrow();
  });

  it('always opens with title and contains exhibition and photos', () => {
    const modes: LengthMode[] = ['auto', 30, 60, 90, 120];
    for (const lengthMode of modes) {
      const list = ids(buildStoryboard({ photoCount: 7, lengthMode, musicDuration: null }));
      expect(list[0]).toBe('title');
      expect(list).toContain('exhibition');
      expect(list).toContain('photos');
      expect(list.at(-1)).toBe('ending');
    }
  });
});

describe('presets', () => {
  it('shotsForLength matches the preset thresholds', () => {
    expect(shotsForLength(44)).toEqual(presetShots(30));
    expect(shotsForLength(45)).toEqual(presetShots(60));
    expect(shotsForLength(104)).toEqual(presetShots(90));
    expect(shotsForLength(105)).toEqual(presetShots(120));
  });
});

describe('shotIndexAt', () => {
  it('finds the shot containing t and clamps outside the range', () => {
    const sb = buildStoryboard({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
    expect(shotIndexAt(sb, -5)).toBe(0);
    expect(shotIndexAt(sb, 0)).toBe(0);
    expect(shotIndexAt(sb, 6)).toBe(1);
    expect(shotIndexAt(sb, 5.999)).toBe(0);
    expect(shotIndexAt(sb, 1e6)).toBe(sb.shots.length - 1);
  });
});
