import { Box3, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { findSegment, requireSegment } from '../../src/plan/sequence';
import { toWorld } from '../../src/stage/frame';
import { HALL } from '../../src/stage/gallery';
import { buildHallRoom, coverRect, videoPanelRect } from '../../src/stage/gallery/rooms/hall';
import type { Vec3 } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const worldPos = (o: Object3D): Vec3 => { o.updateWorldMatrix(true, false); return new Vector3().setFromMatrixPosition(o.matrixWorld).toArray() as Vec3; };
const photoOf = (m: Object3D) => ((m as Mesh).material as MeshBasicMaterial).userData.photoIndex as number;

describe('hall', () => {
  const ctx = fakeGalleryContext(20);
  const room = buildHallRoom(ctx)!;
  const hall = ctx.gallery.hall!;

  it('stands the thumb on its low pedestal at the thumb anchor', () => {
    const [thumb] = named(room.group, 'thumb');
    worldPos(thumb).forEach((v, i) => expect(v).toBeCloseTo(toWorld(hall.thumb, [0, HALL.pedestal.height, 0])[i], 9));
  });

  it('shows the whole thumb inside the 2.35:1 frame while the orbit starts (original 95–101 s)', () => {
    const likes = requireSegment(ctx.sequence, 'likes');
    const halfTan = (Math.tan((19 * Math.PI) / 180) * (16 / 9)) / 2.35;
    room.group.updateMatrixWorld(true);
    const [thumb] = named(room.group, 'thumb');
    const top = new Box3().setFromObject(thumb).max.y;
    for (let t = likes.start + 0.1 * (likes.end - likes.start); t < likes.start + 0.6 * (likes.end - likes.start); t += 0.25) {
      const p = ctx.gallery.track.pos.at(t);
      const q = ctx.gallery.track.target.at(t);
      const d = Math.hypot(q[0] - p[0], q[2] - p[2]);
      const ahead = ((hall.thumb.origin[0] - p[0]) * (q[0] - p[0]) + (hall.thumb.origin[2] - p[2]) * (q[2] - p[2])) / d;
      expect((top - p[1]) / ahead, `t=${t.toFixed(2)}`).toBeLessThan(0.92 * halfTan);
    }
  });

  it('lines the Likes wall with old TVs on stands, the colour-bar ones sharing one material', () => {
    expect(named(room.group, 'crt')).toHaveLength(HALL.crt.count);
    const screens = named(room.group, 'screen') as Mesh[];
    expect(screens).toHaveLength(HALL.crt.count);
    const bars = screens.filter((_, i) => hall.crts.screens[i].bars);
    expect(bars.length).toBeGreaterThan(0);
    expect(new Set(bars.map((s) => s.material)).size).toBe(1);
  });

  it('hangs the 6 × 5 grid and swaps its photos with time, purely in t', () => {
    const cells = named(room.group, 'grid-cell');
    expect(cells).toHaveLength(HALL.grid.cols * HALL.grid.rows);
    const { start, step } = hall.grid;
    room.update!(start);
    const first = cells.map(photoOf);
    expect(first).toEqual(hall.grid.cells.map((c) => c.photos[0]));
    room.update!(start + 3.5 * step);
    expect(cells.map(photoOf)).toEqual(hall.grid.cells.map((c) => c.photos[3]));
    room.update!(start);
    expect(cells.map(photoOf)).toEqual(first);
  });

  it('spreads one photo over the 12 Videos panels and pans it', () => {
    const panels = named(room.group, 'video-panel') as Mesh<never, MeshBasicMaterial>[];
    expect(panels).toHaveLength(HALL.videos.cols * HALL.videos.rows);
    const videos = requireSegment(ctx.sequence, 'videos');
    room.update!(videos.start);
    const before = panels[0].material.map!.offset.x;
    room.update!(videos.end);
    expect(panels[0].material.map!.offset.x).not.toBe(before);
  });

  it('works with three photos and disposes its swap materials', () => {
    const small = fakeGalleryContext(3);
    const r = buildHallRoom(small)!;
    const likes = requireSegment(small.sequence, 'likes');
    const robots = requireSegment(small.sequence, 'robots');
    for (let t = likes.start; t < robots.start; t += 0.4) r.update!(t);
    for (const c of named(r.group, 'grid-cell')) expect(photoOf(c)).toBeLessThan(3);
    expect(() => r.dispose!()).not.toThrow();
  });

  it('is not built without Likes', () => {
    const ctx60 = fakeGalleryContext(12, 60);
    expect(findSegment(ctx60.sequence, 'likes')).toBeFalsy();
    expect(buildHallRoom(ctx60)).toBeNull();
  });
});

describe('video wall maths', () => {
  it('coverRect crops to the target aspect', () => {
    expect(coverRect(2, 1)).toEqual([0.25, 0, 0.5, 1]);
    expect(coverRect(0.5, 1)).toEqual([0, 0.25, 1, 0.5]);
  });

  it('panels tile the zoomed rect without gaps inside the cover rect', () => {
    const cover = coverRect(1.5, 2.2);
    for (const [zoom, pan] of [[1, 0], [1.12, -0.04], [1.12, 0.04]] as const) {
      const rects = [0, 1, 2, 3].map((col) => videoPanelRect(col, 0, 4, 3, cover, zoom, pan));
      for (let i = 1; i < 4; i++) expect(rects[i][0]).toBeCloseTo(rects[i - 1][0] + rects[i - 1][2], 12);
      expect(rects[0][0]).toBeGreaterThanOrEqual(cover[0] - 1e-12);
      expect(rects[3][0] + rects[3][2]).toBeLessThanOrEqual(cover[0] + cover[2] + 1e-12);
    }
  });
});
