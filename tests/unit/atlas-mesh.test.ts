import { BoxGeometry, Color, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { buildAtlasInstances, cellTexture, createAtlasMaterial } from '../../src/stage/parts/atlas-mesh';
import { fakeLibrary } from './fake-library';

describe('atlas instances', () => {
  it('groups instances by atlas and writes each photo cell', () => {
    const library = fakeLibrary(300);
    const materials = library.atlases.map(() => new MeshBasicMaterial());
    const items = [0, 255, 256, 299, 3].map((photoIndex) => ({ photoIndex, matrix: new Matrix4() }));
    const meshes = buildAtlasInstances({ geometry: new BoxGeometry(), library, items, material: (a) => materials[a], rect: 'square' });
    expect(meshes.map((m) => m.count)).toEqual([3, 2]);
    expect(meshes[1].material).toBe(materials[1]);
    const rects = meshes[1].geometry.getAttribute('uvRect');
    expect(rects.itemSize).toBe(4);
    expect(Array.from(rects.array.slice(0, 4))).toEqual(Array.from(new Float32Array(library.cell(256).square)));
    expect(Array.from(rects.array.slice(4, 8))).toEqual(Array.from(new Float32Array(library.cell(299).square)));
  });

  it('keeps per-instance colours when given', () => {
    const library = fakeLibrary(4);
    const [mesh] = buildAtlasInstances({
      geometry: new BoxGeometry(), library, rect: 'fit', material: () => new MeshBasicMaterial(),
      items: [{ photoIndex: 1, matrix: new Matrix4(), color: new Color(0.2, 0.4, 0.6) }],
    });
    const c = new Color();
    mesh.getColorAt(0, c);
    expect([c.r, c.g, c.b].map((v) => +v.toFixed(3))).toEqual([0.2, 0.4, 0.6]);
  });

  it('injects the uvRect attribute into the map UVs', () => {
    for (const lit of [true, false]) {
      const material = createAtlasMaterial(new Texture(), lit);
      expect(material instanceof (lit ? MeshStandardMaterial : MeshBasicMaterial)).toBe(true);
      const shader = { vertexShader: '#include <common>\nvoid main() {\n#include <uv_vertex>\n}', fragmentShader: '', uniforms: {} };
      material.onBeforeCompile(shader as never, undefined as never);
      expect(shader.vertexShader).toContain('attribute vec4 uvRect;');
      expect(shader.vertexShader).toContain('vMapUv = uvRect.xy + vMapUv * uvRect.zw;');
    }
  });

  it('cellTexture clones the atlas with the cell offset and repeat', () => {
    const library = fakeLibrary(10);
    const t = cellTexture(library, 7, 'fit');
    const [u, v, w, h] = library.cell(7).fit;
    expect(t).not.toBe(library.atlases[0]);
    expect(t.source).toBe(library.atlases[0].source);
    expect([t.offset.x, t.offset.y, t.repeat.x, t.repeat.y]).toEqual([u, v, w, h]);
  });
});
