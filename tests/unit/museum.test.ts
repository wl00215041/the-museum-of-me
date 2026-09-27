import { Group, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import type { PhotoAsset } from '../../src/assets/photos';
import type { TextureFactory } from '../../src/assets/texture-factory';
import { buildMuseum, type MuseumScene } from '../../src/museum/build';
import { computeLayout } from '../../src/museum/layout';
import { buildTimeline } from '../../src/plan/timeline';
import type { DurationMode } from '../../src/types';

const fakeTex = (aspect = 4): TextureFactory => ({
  text: () => ({ texture: new Texture(), aspect }),
  glow: () => new Texture(),
});

const fakePhotos = (n: number): PhotoAsset[] =>
  Array.from({ length: n }, (_, i) => ({ texture: new Texture(), aspect: i % 3 === 0 ? 0.75 : 1.5, sourceIndex: i }));

function setup(n: number, durationMode: DurationMode = 'auto', opts: { name?: string; textAspect?: number } = {}) {
  const keywords = ['勇氣', 'travel'];
  const timeline = buildTimeline({ photoCount: n, durationMode, hasKeywords: true });
  const photos = fakePhotos(n);
  const layout = computeLayout({ timeline, aspects: photos.map((p) => p.aspect), portraitIndex: 1, keywords, seed: 1 });
  const content = {
    photos,
    captions: photos.map((_, i) => (i % 2 ? `說明 ${i}` : '')),
    portraitIndex: 1,
    name: opts.name ?? '小明',
    subtitle: '2026',
    date: '2026.09.28',
    keywords,
  };
  const museum = buildMuseum(timeline, layout, content, fakeTex(opts.textAspect));
  return { timeline, layout, photos, content, museum };
}

function countPhotoMeshes(museum: MuseumScene, texture: Texture): number {
  let count = 0;
  museum.scene.traverse((o) => {
    if (o instanceof Mesh && o.material instanceof MeshBasicMaterial && o.material.map === texture) count++;
  });
  return count;
}

describe('buildMuseum', () => {
  it('hangs each photo in the corridor, in the gallery when shown, and the portrait in hall and finale', () => {
    for (const [n, mode] of [[10, 'auto'], [60, 30]] as const) {
      const { timeline, photos, museum } = setup(n, mode);
      const shown = new Set(timeline.galleryStops.flatMap((s) => s.photoIndices));
      photos.forEach((p, i) => {
        const expected = 1 + (shown.has(i) ? 1 : 0) + (i === 1 ? 2 : 0);
        expect(countPhotoMeshes(museum, p.texture), `photo ${i} (${n} / ${mode})`).toBe(expected);
      });
    }
  });

  it('a very long name still fits the title box', () => {
    const { layout, museum } = setup(5, 'auto', { name: '非常非常非常非常非常非常非常非常非常非常長的名字', textAspect: 30 });
    const title = museum.scene.getObjectByName('title') as Mesh;
    const geometry = title.geometry as PlaneGeometry;
    expect(geometry.parameters.width).toBeLessThanOrEqual(layout.title.width + 1e-9);
    expect(geometry.parameters.height).toBeLessThanOrEqual(layout.title.height + 1e-9);
  });

  it('rotates the network deterministically with time', () => {
    const { museum, timeline } = setup(10);
    const network = museum.scene.getObjectByName('network') as Group;
    const span = timeline.scenes.find((s) => s.id === 'network')!;
    museum.update(span.start + 1);
    const a = network.rotation.y;
    museum.update(span.start + 3);
    const b = network.rotation.y;
    museum.update(span.start + 1);
    expect(network.rotation.y).toBe(a);
    expect(b).not.toBe(a);
    let lines = 0;
    network.traverse((o) => { if (o instanceof LineSegments) lines++; });
    expect(lines).toBe(1);
  });

  it('places the visitor in the finale and leaves out rooms the timeline dropped', () => {
    const { museum } = setup(10, 30);
    expect(museum.scene.getObjectByName('visitor')).toBeDefined();
    expect(museum.scene.getObjectByName('network')).toBeUndefined();
    expect(museum.scene.getObjectByName('keywords')).toBeUndefined();
  });

  it('rejects content that does not match the layout', () => {
    const { timeline, layout, content } = setup(5);
    expect(() => buildMuseum(timeline, layout, { ...content, photos: content.photos.slice(0, 4) }, fakeTex())).toThrow();
  });

  it('disposes without throwing', () => {
    const { museum } = setup(5);
    expect(() => museum.dispose()).not.toThrow();
  });
});
