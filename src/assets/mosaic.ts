import { mulberry32 } from '../util/rng';

/**
 * For each cell colour (flat rgb) choose a photo (flat rgb average colours) whose colour is close,
 * picking at random among near-equally good candidates so large flat areas are not one repeated photo.
 */
export function assignMosaic(cells: Float32Array, photos: Float32Array, seed: number): Int32Array {
  const nCells = Math.floor(cells.length / 3);
  const nPhotos = Math.floor(photos.length / 3);
  if (nPhotos === 0) throw new Error('mosaic needs at least one photo');
  const rnd = mulberry32(seed);
  const out = new Int32Array(nCells);
  const candidates: number[] = [];
  for (let c = 0; c < nCells; c++) {
    const r = cells[c * 3];
    const g = cells[c * 3 + 1];
    const b = cells[c * 3 + 2];
    let best = Infinity;
    const dist = (p: number) => {
      const dr = photos[p * 3] - r;
      const dg = photos[p * 3 + 1] - g;
      const db = photos[p * 3 + 2] - b;
      return dr * dr + dg * dg + db * db;
    };
    for (let p = 0; p < nPhotos; p++) best = Math.min(best, dist(p));
    candidates.length = 0;
    const limit = best * 1.5 + 0.002;
    for (let p = 0; p < nPhotos && candidates.length < 3; p++) if (dist(p) <= limit) candidates.push(p);
    let pick = candidates[Math.floor(rnd() * candidates.length)];
    if (c > 0 && pick === out[c - 1] && candidates.length > 1) pick = candidates.find((p) => p !== out[c - 1])!;
    out[c] = pick;
  }
  return out;
}
