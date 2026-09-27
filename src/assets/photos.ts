import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

export const MAX_TEXTURE_EDGE = 1600;

export interface PhotoAsset {
  texture: Texture;
  aspect: number;
  /** Index of the originating file in the user's list. */
  sourceIndex: number;
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function loadPhotos(files: File[]): Promise<{ photos: PhotoAsset[]; failed: string[] }> {
  const photos: PhotoAsset[] = [];
  const failed: string[] = [];
  for (const [sourceIndex, file] of files.entries()) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const size = fitWithin(bitmap.width, bitmap.height, MAX_TEXTURE_EDGE);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      bitmap.close();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      photos.push({ texture, aspect: size.width / size.height, sourceIndex });
    } catch {
      failed.push(file.name);
    }
  }
  return { photos, failed };
}
