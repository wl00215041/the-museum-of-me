import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { ATLAS, atlasCell, type AtlasCell } from './atlas';
import type { PhotoPool } from './photo-pool';

export const THUMB_EDGE = 256;
export const HIRES_EDGE = 1600;

export interface PhotoLibrary {
  readonly count: number;
  aspects: number[];
  /** Average sRGB colour of each photo, 0..1. */
  colors: [number, number, number][];
  /** Index of each photo's file in the list the user chose. */
  sourceIndices: number[];
  atlases: Texture[];
  cell(index: number): AtlasCell;
  /** High-resolution textures, only for featured photos. */
  hires: Map<number, Texture>;
  dispose(): void;
}

export function bitmapToTexture(bitmap: ImageBitmap): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export async function loadLibrary(
  files: File[],
  pool: PhotoPool,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<{ library: PhotoLibrary; failed: string[] }> {
  let done = 0;
  const results = await Promise.all(
    files.map((file) =>
      pool
        .thumb(file, THUMB_EDGE)
        .then((r) => r, (err: Error) => {
          if (err.message.includes('disposed')) throw err;
          return null;
        })
        .finally(() => onProgress(++done, files.length)),
    ),
  );
  const failed: string[] = [];
  const kept: { sourceIndex: number; aspect: number; color: [number, number, number]; bitmap: ImageBitmap }[] = [];
  results.forEach((r, sourceIndex) => {
    if (r) kept.push({ sourceIndex, aspect: r.aspect, color: r.color, bitmap: r.bitmap });
    else failed.push(files[sourceIndex].name);
  });

  const chunks: (typeof kept)[] = [];
  for (let i = 0; i < kept.length; i += ATLAS.perAtlas) chunks.push(kept.slice(i, i + ATLAS.perAtlas));
  const atlases = await Promise.all(
    chunks.map((chunk) => pool.atlas(chunk.map((k) => k.bitmap), chunk.map((k) => k.aspect)).then(bitmapToTexture)),
  );

  const aspects = kept.map((k) => k.aspect);
  const hires = new Map<number, Texture>();
  const library: PhotoLibrary = {
    count: kept.length,
    aspects,
    colors: kept.map((k) => k.color),
    sourceIndices: kept.map((k) => k.sourceIndex),
    atlases,
    cell: (index) => atlasCell(index, aspects[index]),
    hires,
    dispose() {
      atlases.forEach((t) => t.dispose());
      hires.forEach((t) => t.dispose());
      hires.clear();
    },
  };
  return { library, failed };
}

export async function loadHires(library: PhotoLibrary, files: File[], indices: number[], pool: PhotoPool): Promise<void> {
  await Promise.all(
    indices.map(async (index) => {
      if (library.hires.has(index)) return;
      const bitmap = await pool.hires(files[library.sourceIndices[index]], HIRES_EDGE);
      library.hires.set(index, bitmapToTexture(bitmap));
    }),
  );
}
