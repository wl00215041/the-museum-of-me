import { describe, expect, it } from 'vitest';
import { scenesToIndices } from '../../src/ui/scene-board';

describe('scenesToIndices', () => {
  it('turns photo ids into indices of the current order and drops unknown ids', () => {
    const order = [40, 10, 30, 20];
    const r = scenesToIndices(order, { friends: [30, 40], photos: [10, 99], location: [], tvs: [20], grid: [], videos: [30], floaters: [20, 10] });
    expect(r).toEqual({ friends: [2, 0], photos: [1], location: [], tvs: [3], grid: [], videos: [2], floaters: [3, 1] });
  });
});
