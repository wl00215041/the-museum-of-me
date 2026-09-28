import { describe, expect, it } from 'vitest';
import { buildSequence } from '../../src/plan/sequence';
import { SCENES, defaultScenes, resolveScenes, scenesInCut } from '../../src/plan/scenes';
import { SCENE_IDS } from '../../src/types';

describe('scenes', () => {
  it('defaults: the same automatic choice as the gallery, within each capacity', () => {
    const d = defaultScenes(20, 7);
    expect(d.friends).toHaveLength(12);
    expect(d.photos).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(d.location).toHaveLength(3);
    expect(d.videos).toEqual([12]);
    expect(d.grid).toHaveLength(20);
    expect(d.floaters).toHaveLength(20);
    expect(new Set(d.tvs).size).toBe(d.tvs.length);
    expect(defaultScenes(20, 7)).toEqual(d);
  });

  it('defaults respect every capacity for 500 photos', () => {
    const d = defaultScenes(500, 3);
    for (const id of SCENE_IDS) {
      expect(d[id].length, id).toBeLessThanOrEqual(SCENES[id].capacity);
      expect(d[id].length, id).toBeGreaterThan(0);
      for (const i of d[id]) expect(i >= 0 && i < 500).toBe(true);
    }
  });

  it('resolve: drops bad indices and duplicates, trims to capacity, and fills empty scenes with the default', () => {
    const r = resolveScenes({ location: [4, 4, -1, 99, 2.5, 7, 1, 0], videos: [], friends: [3] }, 10, 1);
    expect(r.location).toEqual([4, 7, 1]);
    expect(r.videos).toEqual(defaultScenes(10, 1).videos);
    expect(r.friends).toEqual([3]);
    expect(r.photos).toEqual(defaultScenes(10, 1).photos);
    expect(resolveScenes(undefined, 10, 1)).toEqual(defaultScenes(10, 1));
  });

  it('knows which scenes each length shows', () => {
    const cut = (mode: 30 | 60 | 90 | 'auto') => scenesInCut(buildSequence({ photoCount: 20, lengthMode: mode, musicDuration: null }));
    expect([...cut(30)].sort()).toEqual(['floaters', 'photos']);
    expect([...cut(60)].sort()).toEqual(['floaters', 'friends', 'photos']);
    expect(cut('auto').size).toBe(SCENE_IDS.length);
  });
});
