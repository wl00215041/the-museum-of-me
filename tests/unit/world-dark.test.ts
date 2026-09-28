import { Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { requireSegment } from '../../src/plan/sequence';
import { buildLikesRoom } from '../../src/stage/world/rooms/likes';
import { buildMomentsRoom } from '../../src/stage/world/rooms/moments';
import { buildVideosRoom, coverRect, videoPanelRect } from '../../src/stage/world/rooms/videos';
import { buildWordsRoom } from '../../src/stage/world/rooms/words';
import { fakeWorldContext } from './fake-world';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const opacity = (o: Object3D) => ((o as Mesh).material as MeshBasicMaterial).opacity;

describe('dark rooms', () => {
  it('moments: one glowing light box per box in the strip', () => {
    const ctx = fakeWorldContext(3);
    const room = buildMomentsRoom(ctx)!;
    expect(named(room.group, 'lightbox')).toHaveLength(ctx.strip.moments!.boxes.length);
    expect(ctx.strip.moments!.boxes.length).toBeGreaterThanOrEqual(4);
    expect(named(room.group, 'label:Moments')).toHaveLength(1);
  });

  it('words: the highlight word fills the wall around 52–72 % of the segment', () => {
    const ctx = fakeWorldContext(20);
    const room = buildWordsRoom(ctx)!;
    const words = requireSegment(ctx.sequence, 'words');
    const at = (u: number) => words.start + u * (words.end - words.start);
    const [main] = named(room.group, 'led-main');
    const [highlight] = named(room.group, 'led-highlight');
    room.update!(at(0.3));
    expect(opacity(highlight)).toBe(0);
    expect(opacity(main)).toBe(1);
    room.update!(at(0.62));
    expect(opacity(highlight)).toBe(1);
    room.update!(at(0.9));
    expect(opacity(highlight)).toBe(0);
    expect(main.position.z).toBeCloseTo(ctx.strip.words!.wall.center[2] + 0.01, 9);
  });

  it('likes: sculpture on its pedestal, back-wall screens with some colour bars, stand monitors', () => {
    const ctx = fakeWorldContext(20);
    const room = buildLikesRoom(ctx)!;
    expect(named(room.group, 'thumb')).toHaveLength(1);
    const screens = named(room.group, 'screen') as Mesh[];
    expect(screens).toHaveLength(ctx.strip.likes!.monitors.length);
    const bars = screens.filter((_, i) => ctx.strip.likes!.monitors[i].bars);
    expect(bars.length).toBeGreaterThan(0);
    expect(new Set(bars.map((s) => s.material)).size).toBe(1);
  });

  it('videos: 12 panels panning across one photo plus the side-wall screens', () => {
    const ctx = fakeWorldContext(20);
    const room = buildVideosRoom(ctx)!;
    const panels = named(room.group, 'video-panel') as Mesh<never, MeshBasicMaterial>[];
    expect(panels).toHaveLength(12);
    const seg = requireSegment(ctx.sequence, 'videos');
    room.update!(seg.start);
    const before = panels[0].material.map!.offset.x;
    room.update!(seg.end);
    expect(panels[0].material.map!.offset.x).not.toBe(before);
    expect(named(room.group, 'screen')).toHaveLength(ctx.strip.videos!.monitors.length);
    const side = (named(room.group, 'screen') as Mesh[])[0];
    expect(side.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('rooms missing from the cut are not built', () => {
    const ctx = fakeWorldContext(12, 30);
    expect(buildMomentsRoom(ctx)).toBeNull();
    expect(buildWordsRoom(ctx)).toBeNull();
    expect(buildLikesRoom(ctx)).toBeNull();
    expect(buildVideosRoom(ctx)).toBeNull();
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
