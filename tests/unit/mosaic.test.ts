import { describe, expect, it } from 'vitest';
import { assignMosaic } from '../../src/assets/mosaic';

describe('assignMosaic', () => {
  const photos = new Float32Array([0, 0, 0, 1, 1, 1, 0.5, 0.5, 0.5, 1, 0, 0]);

  it('picks the closest photo when the others are far away', () => {
    const cells = new Float32Array([0.02, 0.01, 0, 0.98, 1, 1, 0.9, 0.05, 0.02]);
    expect(Array.from(assignMosaic(cells, photos, 1))).toEqual([0, 1, 3]);
  });

  it('is deterministic and stays in range', () => {
    const cells = new Float32Array(64 * 36 * 3).map((_, i) => (i % 17) / 17);
    const a = assignMosaic(cells, photos, 9);
    expect(Array.from(a)).toEqual(Array.from(assignMosaic(cells, photos, 9)));
    expect(a).toHaveLength(64 * 36);
    expect(Math.max(...a)).toBeLessThan(4);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
  });

  it('works with a single photo and rejects none', () => {
    expect(Array.from(assignMosaic(new Float32Array([0.3, 0.3, 0.3, 0.9, 0.9, 0.9]), new Float32Array([0.5, 0.5, 0.5]), 1))).toEqual([0, 0]);
    expect(() => assignMosaic(new Float32Array(3), new Float32Array(0), 1)).toThrow();
  });
});
