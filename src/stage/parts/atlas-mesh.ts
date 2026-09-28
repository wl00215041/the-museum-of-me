import {
  DoubleSide, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial,
  type BufferGeometry, type Color, type Material, type Matrix4, type Texture,
} from 'three';
import type { PhotoLibrary } from '../../assets/library';

/** A material that reads its map through a per-instance `uvRect` (u, v, w, h) into an atlas. */
export function createAtlasMaterial(atlas: Texture, lit: boolean, doubleSide = false): Material {
  const material = lit ? new MeshStandardMaterial({ map: atlas, roughness: 0.8 }) : new MeshBasicMaterial({ map: atlas });
  if (doubleSide) material.side = DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = uvRect.xy + vMapUv * uvRect.zw;\n#endif');
  };
  material.customProgramCacheKey = () => `atlas-${lit ? 'lit' : 'basic'}`;
  return material;
}

export interface AtlasInstance {
  photoIndex: number;
  matrix: Matrix4;
  color?: Color;
}

/** One InstancedMesh per atlas used by `items`; draw calls do not grow with the photo count. */
export function buildAtlasInstances(o: {
  geometry: BufferGeometry;
  library: PhotoLibrary;
  items: AtlasInstance[];
  material: (atlas: number) => Material;
  rect: 'fit' | 'square';
}): InstancedMesh[] {
  const groups = new Map<number, AtlasInstance[]>();
  for (const item of o.items) {
    const atlas = o.library.cell(item.photoIndex).atlas;
    const list = groups.get(atlas) ?? [];
    list.push(item);
    groups.set(atlas, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([atlas, list]) => {
      const geometry = o.geometry.clone();
      const rects = new Float32Array(list.length * 4);
      const mesh = new InstancedMesh(geometry, o.material(atlas), list.length);
      list.forEach((item, i) => {
        rects.set(o.library.cell(item.photoIndex)[o.rect], i * 4);
        mesh.setMatrixAt(i, item.matrix);
        if (item.color) mesh.setColorAt(i, item.color);
      });
      geometry.setAttribute('uvRect', new InstancedBufferAttribute(rects, 4));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.items = list;
      return mesh;
    });
}

/** A clone of the photo's atlas showing just its cell (shares the uploaded image). */
export function cellTexture(library: PhotoLibrary, index: number, rect: 'fit' | 'square'): Texture {
  const cell = library.cell(index);
  const texture = library.atlases[cell.atlas].clone();
  const [u, v, w, h] = cell[rect];
  texture.offset.set(u, v);
  texture.repeat.set(w, h);
  texture.needsUpdate = true;
  return texture;
}
