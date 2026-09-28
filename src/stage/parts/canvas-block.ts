import { BoxGeometry, Mesh, MeshStandardMaterial, type Material, type Texture } from 'three';

/** Gallery-wrapped canvas thickness (6 cm), as in the original. */
export const BLOCK_DEPTH = 0.06;

/** Clone of `src` cropped (cover) from `aspect` to `target` through the UV transform. */
export function cropTexture(src: Texture, aspect: number, target: number): Texture {
  const t = src.clone();
  if (aspect > target) {
    const w = target / aspect;
    t.repeat.set(w, 1);
    t.offset.set((1 - w) / 2, 0);
  } else {
    const h = aspect / target;
    t.repeat.set(1, h);
    t.offset.set(0, (1 - h) / 2);
  }
  t.needsUpdate = true;
  return t;
}

/** A frameless canvas: the photo on the +Z face, dark sides. Centre it DEPTH/2 in front of the wall. */
export function createCanvasBlock(texture: Texture, aspect: number, width: number, height: number, side: Material): Mesh {
  const front = new MeshStandardMaterial({ map: cropTexture(texture, aspect, width / height), roughness: 0.75 });
  front.userData.owned = true;
  front.userData.ownsMap = true;
  return new Mesh(new BoxGeometry(width, height, BLOCK_DEPTH), [side, side, side, side, front, side]);
}
