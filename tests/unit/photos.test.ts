import { describe, expect, it } from 'vitest';
import { MAX_TEXTURE_EDGE, fitWithin } from '../../src/assets/photos';

describe('fitWithin', () => {
  it('leaves small images untouched', () => {
    expect(fitWithin(800, 600, MAX_TEXTURE_EDGE)).toEqual({ width: 800, height: 600 });
  });

  it('scales the longer edge down to the limit for landscape and portrait images', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never returns a zero dimension', () => {
    expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
