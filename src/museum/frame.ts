import { BoxGeometry, Group, Mesh, PlaneGeometry, type Object3D } from 'three';
import type { PhotoAsset } from '../assets/photos';
import type { Vec3 } from '../types';
import { FRAME_SIDE, type PhotoSlot } from './layout';
import type { Materials } from './materials';

/** Share of FRAME_SIDE taken by the white mat; the rest shows as dark molding. */
const MAT_SHARE = 0.75;
const DEPTH = 0.05;

/** Positions obj on a wall so that its local +Z faces along the wall normal. */
export function placeOnWall(obj: Object3D, box: { center: Vec3; normal: Vec3 }, offset = 0): void {
  const [x, y, z] = box.center;
  const [nx, , nz] = box.normal;
  obj.position.set(x + nx * offset, y, z + nz * offset);
  obj.rotation.set(0, Math.atan2(nx, nz), 0);
}

export function createFramedPhoto(slot: PhotoSlot, photo: PhotoAsset, mats: Materials): Group {
  const { width: w, height: h } = slot;
  const side = FRAME_SIDE * Math.max(w, h);
  const mat = side * MAT_SHARE;
  const group = new Group();
  group.name = `frame:${slot.photoIndex}`;
  const molding = new Mesh(new BoxGeometry(w + 2 * side, h + 2 * side, DEPTH), mats.frame);
  molding.position.z = DEPTH / 2;
  const board = new Mesh(new PlaneGeometry(w + 2 * mat, h + 2 * mat), mats.mat);
  board.position.z = DEPTH + 0.002;
  const picture = new Mesh(new PlaneGeometry(w, h), mats.photo(photo.texture));
  picture.position.z = DEPTH + 0.004;
  group.add(molding, board, picture);
  placeOnWall(group, slot);
  return group;
}

/** Soft additive light pool on the wall, standing in for a gallery spotlight. */
export function createGlow(mats: Materials, center: Vec3, normal: Vec3, width: number, height: number): Mesh {
  const glow = new Mesh(new PlaneGeometry(width, height), mats.glow);
  placeOnWall(glow, { center, normal }, 0.01);
  return glow;
}
