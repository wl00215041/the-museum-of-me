import { describe, expect, it } from 'vitest';
import { ATLAS, atlasCell, atlasCount, cellPixelBox, fitWithin, thumbSize } from '../../src/assets/atlas';

describe('atlas geometry', () => {
  it('sizes thumbnails to the cell by their long edge', () => {
    expect(thumbSize(1)).toEqual({ width: 256, height: 256 });
    expect(thumbSize(2)).toEqual({ width: 256, height: 128 });
    expect(thumbSize(0.5)).toEqual({ width: 128, height: 256 });
  });

  it('centres a thumbnail inside its cell, row 0 at the top', () => {
    expect(cellPixelBox(0, 2)).toEqual({ x: 0, y: 64, width: 256, height: 128 });
    expect(cellPixelBox(17, 1)).toEqual({ x: 256, y: 256, width: 256, height: 256 });
  });

  it('maps cells to bottom-up UV rects inset by one pixel', () => {
    const px = 1 / ATLAS.size;
    const c = atlasCell(0, 1);
    expect(c.atlas).toBe(0);
    c.fit.forEach((v, i) => expect(v).toBeCloseTo([px, 1 - 255 * px, 254 * px, 254 * px][i], 12));
    expect(c.square).toEqual(c.fit);
  });

  it('keeps the square inside the fit rect for wide and tall photos', () => {
    for (const aspect of [0.4, 0.75, 1.6, 3]) {
      const { fit, square } = atlasCell(5, aspect);
      expect(square[0]).toBeGreaterThanOrEqual(fit[0] - 1e-12);
      expect(square[1]).toBeGreaterThanOrEqual(fit[1] - 1e-12);
      expect(square[0] + square[2]).toBeLessThanOrEqual(fit[0] + fit[2] + 1e-12);
      expect(square[1] + square[3]).toBeLessThanOrEqual(fit[1] + fit[3] + 1e-12);
      expect(square[2]).toBeCloseTo(square[3], 12);
      expect(fit[2] / fit[3] / aspect).toBeCloseTo(1, 1);
    }
  });

  it('rolls over to the next atlas after 256 photos', () => {
    expect(atlasCell(255, 1).atlas).toBe(0);
    expect(atlasCell(256, 1).atlas).toBe(1);
    expect(atlasCell(256, 1).fit).toEqual(atlasCell(0, 1).fit);
    expect(atlasCount(256)).toBe(1);
    expect(atlasCount(257)).toBe(2);
    expect(atlasCount(500)).toBe(2);
  });

  it('fitWithin scales only when needed', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
});
