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

/** Draws each (instanced) mesh as a flat billboard that always faces the camera, keeping its scale. */
export function makeBillboard<M extends Material>(material: M, key: string): M {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#ifdef USE_INSTANCING
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float bbScale = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
#else
  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float bbScale = length(modelMatrix[0].xyz);
#endif
  mvPosition.xy += transformed.xy * bbScale;
  gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  material.customProgramCacheKey = () => `billboard-${key}`;
  material.userData.billboard = true;
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

/** Like `cellTexture(…, 'fit')`, then cropped (cover) to `target` aspect. */
export function cellTextureCropped(library: PhotoLibrary, index: number, target: number): Texture {
  const cell = library.cell(index);
  const aspect = library.aspects[index];
  let [u, v, w, h] = cell.fit;
  if (aspect > target) {
    const nw = (w * target) / aspect;
    u += (w - nw) / 2;
    w = nw;
  } else {
    const nh = (h * aspect) / target;
    v += (h - nh) / 2;
    h = nh;
  }
  const texture = library.atlases[cell.atlas].clone();
  texture.offset.set(u, v);
  texture.repeat.set(w, h);
  texture.needsUpdate = true;
  return texture;
}
