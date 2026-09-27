import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { TextTexture } from '../assets/texture-factory';
import { fitBox } from './layout';

/** A transparent plane showing `text`, as large as fits in maxWidth × maxHeight. */
export function createTextPlane(text: TextTexture, maxWidth: number, maxHeight: number): Mesh {
  const size = fitBox(text.aspect, maxWidth, maxHeight);
  const material = new MeshBasicMaterial({ map: text.texture, transparent: true, depthWrite: false });
  material.userData.ownsMap = true;
  return new Mesh(new PlaneGeometry(size.width, size.height), material);
}
