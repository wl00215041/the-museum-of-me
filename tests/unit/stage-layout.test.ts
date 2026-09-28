import { describe, expect, it } from 'vitest';
import { buildStoryboard } from '../../src/plan/storyboard';
import {
  FLOATERS, MAX_MOMENTS, MAX_NETWORK_NODES, MAX_PORTRAITS, MOSAIC, ROBOT_TILES, STARS,
  computeStageLayout, pickSpread, type CanvasItem,
} from '../../src/stage/layout';
import { WALL, WALL_TEXT, cameraX, focusX, titleX, wallPose, wallRunOf, yawAt } from '../../src/stage/wall-run';
import type { LengthMode } from '../../src/types';

const aspectsFor = (n: number, pattern = [1.5, 0.75, 1, 1.78, 0.5]) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);

function make(n: number, lengthMode: LengthMode = 'auto', aspects = aspectsFor(n)) {
  const storyboard = buildStoryboard({ photoCount: n, lengthMode, musicDuration: null });
  return { storyboard, layout: computeStageLayout({ storyboard, aspects, portraitIndex: Math.min(2, n - 1), seed: 11 }) };
}

const allFinite = (v: unknown): boolean =>
  typeof v === 'number' ? Number.isFinite(v)
  : Array.isArray(v) ? v.every(allFinite)
  : v !== null && typeof v === 'object' ? Object.values(v).every(allFinite)
  : true;

const overlapArea = (a: CanvasItem, b: CanvasItem) => {
  const dx = Math.min(a.center[0] + a.width / 2, b.center[0] + b.width / 2) - Math.max(a.center[0] - a.width / 2, b.center[0] - b.width / 2);
  const dy = Math.min(a.center[1] + a.height / 2, b.center[1] + b.height / 2) - Math.max(a.center[1] - a.height / 2, b.center[1] - b.height / 2);
  return dx > 0 && dy > 0 ? dx * dy : 0;
};

describe('wall run', () => {
  it('uses the base speed for the auto cut and speeds up only when texts would not fit', () => {
    expect(wallRunOf(make(20).storyboard).speed).toBe(WALL.speed);
    expect(wallRunOf(make(20, 30).storyboard).speed).toBeGreaterThan(WALL.speed);
  });

  it('starts turned right and reaches exactly parallel at the exhibition midpoint', () => {
    const run = wallRunOf(make(20).storyboard);
    expect(yawAt(run, 0)).toBeCloseTo(WALL.yaw0, 12);
    expect(yawAt(run, run.exhibitionTime)).toBe(0);
    expect(yawAt(run, run.exhibitionTime + 3)).toBe(0);
    let prev = Infinity;
    for (let t = 0; t <= run.end; t += 0.1) {
      const y = yawAt(run, t);
      expect(y).toBeLessThanOrEqual(prev + 1e-12);
      prev = y;
    }
    const pose = wallPose(run, run.exhibitionTime);
    expect(pose.target[0]).toBeCloseTo(pose.pos[0], 9);
  });

  it('title sits just right of the initial focus point', () => {
    const run = wallRunOf(make(20).storyboard);
    expect(titleX()).toBeCloseTo(focusX(run, 0) + 0.6, 9);
  });
});

describe('computeStageLayout', () => {
  it('centres the exhibition text on the camera at the exhibition midpoint', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      const { layout } = make(20, mode);
      const run = layout.wall.run;
      expect(layout.wall.exhibition.center[0]).toBeCloseTo(cameraX(run, run.exhibitionTime), 9);
    }
  });

  it('keeps wall texts apart in every preset', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      for (const n of [3, 20, 500]) {
        const { layout } = make(n, mode);
        const { title, intro, exhibition } = layout.wall;
        const titleRight = title.center[0] + title.width / 2;
        const exLeft = exhibition.center[0] - exhibition.width / 2;
        if (intro) {
          const introLeft = intro.avatar.center[0] - intro.avatar.width / 2;
          const introRight = intro.center[0] + intro.width / 2;
          expect(introLeft).toBeGreaterThanOrEqual(titleRight + WALL_TEXT.gap - 1e-9);
          expect(introRight).toBeLessThanOrEqual(exLeft - WALL_TEXT.gap + 1e-9);
        } else {
          expect(exLeft).toBeGreaterThanOrEqual(titleRight + WALL_TEXT.gap - 1e-9);
        }
        const exRight = exhibition.center[0] + exhibition.width / 2;
        const firstAfter = layout.wall.portraits?.items[0] ?? layout.wall.photos.items[0];
        expect(firstAfter.center[0] - firstAfter.width / 2).toBeGreaterThan(exRight);
      }
    }
  });

  it('drops intro and portraits from the 30 s cut', () => {
    const { layout } = make(20, 30);
    expect(layout.wall.intro).toBeNull();
    expect(layout.wall.portraits).toBeNull();
  });

  it('hangs up to 12 square portraits along the portraits pass', () => {
    const { layout, storyboard } = make(60);
    const p = layout.wall.portraits!;
    expect(p.items.length).toBeGreaterThan(0);
    expect(p.items.length).toBeLessThanOrEqual(MAX_PORTRAITS);
    const span = storyboard.shots.find((s) => s.id === 'portraits')!;
    const run = layout.wall.run;
    for (const item of p.items) {
      expect(item.width).toBe(item.height);
      expect(item.center[0]).toBeLessThanOrEqual(cameraX(run, span.end));
    }
  });

  it('places every photo on the swarm inside the wall with little overlap', () => {
    for (const n of [3, 10, 100, 500]) {
      const { layout } = make(n);
      const items = layout.wall.photos.items;
      expect(items.map((i) => i.photoIndex)).toEqual(Array.from({ length: n }, (_, i) => i));
      let area = 0;
      let overlap = 0;
      items.forEach((a, i) => {
        area += a.width * a.height;
        expect(a.center[1] - a.height / 2).toBeGreaterThanOrEqual(0.6 - 1e-9);
        expect(a.center[1] + a.height / 2).toBeLessThanOrEqual(WALL.height - 0.6 + 1e-9);
        for (let j = Math.max(0, i - 60); j < i; j++) overlap += overlapArea(a, items[j]);
      });
      expect(overlap / area).toBeLessThan(0.2);
    }
  });

  it('handles three photos', () => {
    const { layout } = make(3);
    expect(layout.moments.boxes).toHaveLength(3);
    expect(layout.likes.monitors.every((m) => m.photoIndex >= 0 && m.photoIndex < 3)).toBe(true);
    expect(layout.network.nodes).toHaveLength(2);
    expect(layout.robots.tiles.every((t) => t.photoIndex < 3)).toBe(true);
    expect(allFinite(layout)).toBe(true);
  });

  it('all-portrait photos keep aspect-correct canvases', () => {
    const { layout } = make(30, 'auto', aspectsFor(30, [0.6]));
    for (const item of layout.wall.photos.items) expect(item.width / item.height).toBeCloseTo(0.6, 9);
    expect(allFinite(layout)).toBe(true);
  });

  it('fills the dark rooms, robots, mosaic and network', () => {
    const { layout } = make(40);
    expect(layout.moments.boxes).toHaveLength(MAX_MOMENTS);
    expect(layout.moments.cameraTo).toBeGreaterThan(layout.moments.cameraFrom);
    expect(layout.likes.monitors).toHaveLength(28);
    expect(layout.likes.monitors.some((m) => m.bars)).toBe(true);
    expect(layout.videos.panels).toHaveLength(12);
    expect(layout.robots.tiles).toHaveLength(ROBOT_TILES.cols * ROBOT_TILES.rows);
    expect(new Set(layout.robots.tiles.map((t) => t.photoIndex)).size).toBe(40);
    expect(layout.robots.floaters).toHaveLength(FLOATERS);
    expect(layout.robots.arms).toHaveLength(4);
    expect(layout.mosaic).toEqual(MOSAIC);
    expect(layout.network.nodes.length).toBeLessThanOrEqual(MAX_NETWORK_NODES);
    expect(layout.network.nodes.every((n) => n.photoIndex !== layout.portraitIndex)).toBe(true);
    expect(layout.network.stars).toHaveLength(STARS * 3);
    for (const [a, b] of layout.network.edges) {
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(b).toBeLessThan(layout.network.nodes.length);
    }
  });

  it('lists featured photos once, starting with the portrait', () => {
    const { layout } = make(100);
    expect(layout.featured[0]).toBe(layout.portraitIndex);
    expect(new Set(layout.featured).size).toBe(layout.featured.length);
    expect(layout.featured.length).toBeLessThanOrEqual(1 + MAX_PORTRAITS + MAX_MOMENTS + 1);
  });

  it('is deterministic for the same input', () => {
    expect(make(50).layout).toEqual(make(50).layout);
  });
});

describe('pickSpread', () => {
  it('spreads k distinct indices across n', () => {
    expect(pickSpread(10, 5)).toEqual([1, 3, 5, 7, 9]);
    expect(pickSpread(3, 6).length).toBe(3);
    expect(new Set(pickSpread(500, 12)).size).toBe(12);
  });
});
