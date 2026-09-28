export const ATLAS = { size: 4096, cell: 256, perRow: 16, perAtlas: 256 } as const;

export type UvRect = [number, number, number, number];

export interface AtlasCell {
  atlas: number;
  /** The whole photo at its own aspect ratio. */
  fit: UvRect;
  /** The centred square of the photo. */
  square: UvRect;
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function thumbSize(aspect: number): { width: number; height: number } {
  const c = ATLAS.cell;
  return aspect >= 1
    ? { width: c, height: Math.max(1, Math.round(c / aspect)) }
    : { width: Math.max(1, Math.round(c * aspect)), height: c };
}

/** Pixel box of a thumbnail inside its atlas (row 0 at the top), centred in its cell. */
export function cellPixelBox(slot: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const { cell, perRow } = ATLAS;
  const { width, height } = thumbSize(aspect);
  return {
    x: (slot % perRow) * cell + Math.floor((cell - width) / 2),
    y: Math.floor(slot / perRow) * cell + Math.floor((cell - height) / 2),
    width,
    height,
  };
}

export function atlasCell(index: number, aspect: number): AtlasCell {
  const { size, perAtlas } = ATLAS;
  const box = cellPixelBox(index % perAtlas, aspect);
  const toUv = (x: number, y: number, w: number, h: number): UvRect => [
    (x + 1) / size,
    1 - (y + h - 1) / size,
    (w - 2) / size,
    (h - 2) / size,
  ];
  const side = Math.min(box.width, box.height);
  return {
    atlas: Math.floor(index / perAtlas),
    fit: toUv(box.x, box.y, box.width, box.height),
    square: toUv(box.x + Math.floor((box.width - side) / 2), box.y + Math.floor((box.height - side) / 2), side, side),
  };
}

export const atlasCount = (n: number): number => Math.ceil(n / ATLAS.perAtlas);
