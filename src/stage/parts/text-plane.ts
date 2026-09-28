import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { TextTexture } from '../../assets/texture-factory';

export function fitBox(aspect: number, maxW: number, maxH: number): { width: number; height: number } {
  return aspect >= maxW / maxH ? { width: maxW, height: maxW / aspect } : { width: maxH * aspect, height: maxH };
}

/** A transparent plane showing `text`, as large as fits in maxWidth × maxHeight. */
export function createTextPlane(text: TextTexture, maxWidth: number, maxHeight: number): Mesh {
  const size = fitBox(text.aspect, maxWidth, maxHeight);
  const material = new MeshBasicMaterial({ map: text.texture, transparent: true, depthWrite: false });
  material.userData.owned = true;
  material.userData.ownsMap = true;
  return new Mesh(new PlaneGeometry(size.width, size.height), material);
}
