import { Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { VIDEO_WALL } from '../../src/stage/layout';
import { cellTextureCropped } from '../../src/stage/parts/atlas-mesh';
import { buildLikesSet } from '../../src/stage/sets/likes';
import { buildMomentsSet } from '../../src/stage/sets/moments';
import { coverRect, buildVideosSet, videoPanelRect } from '../../src/stage/sets/videos';
import { buildWordsSet } from '../../src/stage/sets/words';
import { fakeLibrary } from './fake-library';
import { fakeContext } from './fake-stage';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const opacity = (o: Object3D) => ((o as Mesh).material as MeshBasicMaterial).opacity;

describe('dark rooms', () => {
  it('moments: one glowing light box per chosen photo', () => {
    const ctx = fakeContext(20);
    const set = buildMomentsSet(ctx, ['moments']);
    expect(set.dark).toBe(true);
    expect(named(set.scene, 'lightbox')).toHaveLength(ctx.layout.moments.boxes.length);
    expect(named(set.scene, 'visitor')).toHaveLength(2);
  });

  it('words: the highlight word takes over during the second half', () => {
    const ctx = fakeContext(20);
    const set = buildWordsSet(ctx, ['words']);
    const span = ctx.storyboard.shots.find((s) => s.id === 'words')!;
    const d = span.end - span.start;
    const [main] = named(set.scene, 'led-main');
    const [highlight] = named(set.scene, 'led-highlight');
    set.update(span.start + 0.3 * d);
    expect(opacity(highlight)).toBe(0);
    expect(opacity(main)).toBe(1);
    set.update(span.start + 0.9 * d);
    expect(opacity(highlight)).toBe(1);
    expect(opacity(main)).toBeCloseTo(0.15, 9);
  });

  it('likes: sculpture, 28 screens (some colour bars) and a spot light', () => {
    const ctx = fakeContext(20);
    const set = buildLikesSet(ctx, ['likes']);
    expect(named(set.scene, 'thumb')).toHaveLength(1);
    const screens = named(set.scene, 'screen') as Mesh[];
    expect(screens).toHaveLength(28);
    const barsMaterial = screens.find((_, i) => ctx.layout.likes.monitors[i].bars)!.material;
    expect(screens.filter((s) => s.material === barsMaterial).length).toBe(ctx.layout.likes.monitors.filter((m) => m.bars).length);
  });

  it('videos: 12 panels that pan across one photo over time', () => {
    const ctx = fakeContext(20);
    const set = buildVideosSet(ctx, ['videos']);
    const span = ctx.storyboard.shots.find((s) => s.id === 'videos')!;
    const panels = named(set.scene, 'video-panel') as Mesh<never, MeshBasicMaterial>[];
    expect(panels).toHaveLength(VIDEO_WALL.cols * VIDEO_WALL.rows);
    set.update(span.start);
    const before = panels[0].material.map!.offset.x;
    set.update(span.end);
    expect(panels[0].material.map!.offset.x).not.toBe(before);
    expect(() => set.dispose()).not.toThrow();
  });
});

describe('video wall maths', () => {
  it('coverRect crops to the target aspect', () => {
    expect(coverRect(2, 1)).toEqual([0.25, 0, 0.5, 1]);
    expect(coverRect(0.5, 1)).toEqual([0, 0.25, 1, 0.5]);
  });

  it('panels tile the zoomed, panned rect without gaps and stay inside the cover rect', () => {
    const cover = coverRect(1.5, 2.2);
    for (const [zoom, pan] of [[1, 0], [1.12, -0.04], [1.12, 0.04]] as const) {
      const rects = [0, 1, 2, 3].map((col) => videoPanelRect(col, 0, 4, 3, cover, zoom, pan));
      for (let i = 1; i < 4; i++) expect(rects[i][0]).toBeCloseTo(rects[i - 1][0] + rects[i - 1][2], 12);
      const top = videoPanelRect(0, 0, 4, 3, cover, zoom, pan);
      const bottom = videoPanelRect(0, 2, 4, 3, cover, zoom, pan);
      expect(top[1]).toBeGreaterThan(bottom[1]);
      expect(rects[0][0]).toBeGreaterThanOrEqual(cover[0] - 1e-12);
      expect(rects[3][0] + rects[3][2]).toBeLessThanOrEqual(cover[0] + cover[2] + 1e-12);
    }
  });

  it('cellTextureCropped crops the photo cell to the screen aspect', () => {
    const library = fakeLibrary(3, [2, 1, 0.5]);
    const t = cellTextureCropped(library, 0, 1);
    const [, , w, h] = library.cell(0).fit;
    expect(t.repeat.x).toBeCloseTo(w / 2, 12);
    expect(t.repeat.y).toBeCloseTo(h, 12);
  });
});
