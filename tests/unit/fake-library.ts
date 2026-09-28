import { Texture } from 'three';
import { atlasCell, atlasCount } from '../../src/assets/atlas';
import type { PhotoLibrary } from '../../src/assets/library';

export function fakeLibrary(n: number, aspects?: number[], hiresFor: number[] = []): PhotoLibrary {
  const a = aspects ?? Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const atlases = Array.from({ length: atlasCount(n) }, () => new Texture());
  const hires = new Map<number, Texture>();
  for (const i of hiresFor) {
    const t = new Texture();
    t.image = { width: 1600, height: Math.round(1600 / a[i]) };
    hires.set(i, t);
  }
  return {
    count: n,
    aspects: a,
    colors: a.map((_, i) => [(i % 7) / 7, 0.5, 0.4] as [number, number, number]),
    sourceIndices: a.map((_, i) => i),
    atlases,
    cell: (i) => atlasCell(i, a[i]),
    hires,
    dispose() {},
  };
}
