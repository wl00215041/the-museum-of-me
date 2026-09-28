import { describe, expect, it } from 'vitest';
import { TRACK } from '../../src/camera/track';
import { buildSequence, findSegment, requireSegment } from '../../src/plan/sequence';
import { toLocal, toWorld } from '../../src/stage/frame';
import { HALL, TEXT, computeGallery, gallerySpeed, type Gallery, type WallQuad } from '../../src/stage/gallery';
import { MAX_WALL_PHOTOS, MIN_NETWORK_NODES } from '../../src/stage/placement';
import type { LengthMode, Vec3 } from '../../src/types';

const CUTS: { mode: LengthMode; music: number | null }[] = [
  { mode: 'auto', music: null }, { mode: 30, music: null }, { mode: 60, music: null }, { mode: 90, music: null }, { mode: 120, music: null },
  { mode: 'music', music: 46 }, { mode: 'music', music: 74 }, { mode: 'music', music: 104 }, { mode: 'music', music: 300 },
];

function make(n = 20, mode: LengthMode = 'auto', music: number | null = null) {
  const sequence = buildSequence({ photoCount: n, lengthMode: mode, musicDuration: music });
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  return { sequence, gallery: computeGallery({ sequence, aspects, portraitIndex: 1 % n, seed: 7 }) };
}

const ends = (w: WallQuad): [Vec3, Vec3] => [toWorld(w.frame, [w.center[0] - w.width / 2, 0, 0]), toWorld(w.frame, [w.center[0] + w.width / 2, 0, 0])];
const orient = (p: Vec3, q: Vec3, r: Vec3) => (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
const cross = ([a, b]: [Vec3, Vec3], [c, d]: [Vec3, Vec3]) => orient(c, d, a) * orient(c, d, b) < -1e-6 && orient(a, b, c) * orient(a, b, d) < -1e-6;
function distance(p: Vec3, [a, b]: [Vec3, Vec3]): number {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - u * dx, p[2] - a[2] - u * dz);
}
const insideObstacle = (g: Gallery, p: Vec3, t: number, region: 'walk' | 'robots') =>
  g.obstacles
    .filter((o) => (o.region === region || o.region === 'both') && (o.until === undefined || t < o.until))
    .find((o) => toLocal(o.frame, p).every((v, i) => v > o.min[i] && v < o.max[i]));

describe('computeGallery', () => {
  it('walks at the measured 0.95 m/s in the auto cut, faster in the fixed cuts, with the wall texts apart', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      expect(gallery.speed).toBe(gallerySpeed(sequence));
      if (c.mode === 'auto') expect(gallery.speed).toBe(TRACK.speed);
      const { title, exhibition, intro } = gallery.wall;
      expect(title.center[0] + TEXT.titleWidth / 2 + TEXT.gap).toBeLessThanOrEqual(exhibition.center[0] - TEXT.exhibitionWidth / 2 + 1e-9);
      if (intro) {
        expect(intro.avatar.center[0] - intro.avatar.width / 2).toBeGreaterThanOrEqual(exhibition.center[0] + TEXT.exhibitionWidth / 2 + TEXT.gap - 1e-9);
        const block = gallery.track.anchors.whiteBlock;
        if (block) expect(intro.center[0] + intro.width / 2 + TEXT.endMargin).toBeLessThanOrEqual(block.x0 + 1e-9);
      }
    }
  });

  it('centres the exhibition text on the camera at t_ex', () => {
    const { gallery } = make();
    expect(gallery.wall.exhibition.center[0]).toBeCloseTo(gallery.track.pose(gallery.track.tEx).pos[0], 9);
  });

  it('hangs Friends and Photos on one white wall with nothing between them', () => {
    const { gallery } = make();
    const whiteBlocks = gallery.blocks.filter((b) => b.name === 'white-block');
    expect(whiteBlocks).toHaveLength(1);
    const blockRight = whiteBlocks[0].center[0] + whiteBlocks[0].size[0] / 2;
    const items = [...gallery.portraits!.items, ...gallery.photos.items];
    for (const i of items) expect(i.center[2] >= 0 && i.center[2] < 0.3).toBe(true);
    const xs = items.map((i) => i.center[0]);
    expect(Math.min(...xs)).toBeGreaterThan(blockRight);
    const between = gallery.blocks.filter((b) => {
      const c = toWorld(b.frame, b.center);
      return c[0] > blockRight && c[0] < Math.max(...xs) && c[2] < 5;
    });
    expect(between).toEqual([]);
    expect(gallery.track.wipes.map((w) => w.name)).toEqual(['white-block', 'dark-pillar', 'robot-door']);
  });

  it('Photos grow along the wall so they stay legible as the camera pulls back', () => {
    const { gallery } = make(60);
    const items = [...gallery.photos.items].sort((a, b) => a.center[0] - b.center[0]);
    const third = Math.floor(items.length / 3);
    const size = (xs: typeof items) => xs.reduce((s, i) => s + Math.max(i.width, i.height), 0) / xs.length;
    expect(size(items.slice(-third))).toBeGreaterThan(1.6 * size(items.slice(0, third)));
  });

  it('hangs at most MAX_WALL_PHOTOS photos, large enough to read even for big archives', () => {
    for (const n of [200, 500]) {
      const items = make(n).gallery.photos.items;
      expect(items.length).toBe(Math.min(n, MAX_WALL_PHOTOS));
      const sizes = items.map((i) => Math.max(i.width, i.height)).sort((a, b) => a - b);
      expect(sizes[sizes.length >> 1], `n=${n}`).toBeGreaterThan(0.6);
      expect(new Set(items.map((i) => i.photoIndex)).size).toBe(items.length);
    }
  });

  it('layers overlapping photos so that no two share a plane (no z-fighting while the camera moves)', () => {
    for (const n of [20, 200]) {
      const items = make(n).gallery.photos.items;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const overlap = Math.abs(a.center[0] - b.center[0]) < (a.width + b.width) / 2 && Math.abs(a.center[1] - b.center[1]) < (a.height + b.height) / 2;
          if (overlap) expect(Math.abs(a.center[2] - b.center[2]), `n=${n} ${i}/${j}`).toBeGreaterThanOrEqual(0.01);
        }
      }
    }
  });

  it('network photo bubbles are large enough to read', () => {
    for (const node of make(20).gallery.finale.network.nodes) expect(node.radius).toBeGreaterThanOrEqual(0.3);
  });

  it('hangs the photos assigned to each scene, in scene order', () => {
    const n = 20;
    const sequence = buildSequence({ photoCount: n, lengthMode: 'auto', musicDuration: null });
    const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
    const scenes = { friends: [5, 3, 9], photos: [0, 1, 2, 3, 4], location: [7, 2], tvs: [11, 12], grid: [4, 6, 8], videos: [13], floaters: [15, 16, 17, 18, 19, 14, 10, 1, 2] };
    const g = computeGallery({ sequence, aspects, portraitIndex: 1, seed: 7, scenes });
    expect(g.portraits!.items.map((i) => i.photoIndex)).toEqual([5, 3, 9]);
    expect(g.photos.items.map((i) => i.photoIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(g.location!.boxes.map((b) => b.photoIndex)).toEqual([7, 2]);
    const [a, b] = g.location!.boxes.map((x) => x.center[0]);
    expect(b).toBeGreaterThan(a);
    expect(g.hall!.crts.screens.map((s) => s.photoIndex)).toEqual([11, 12, 11, 12, 11, 12, 11]);
    expect(g.hall!.grid.cells.slice(0, 6).map((c) => c.photos[0])).toEqual([4, 6, 8, 4, 6, 8]);
    for (const c of g.hall!.grid.cells) expect(new Set(c.photos).size).toBe(1);
    expect(g.hall!.videos.photoIndex).toBe(13);
    const large = g.robots.floaters.filter((f) => f.size >= 0.8).map((f) => f.photoIndex);
    expect(large.length).toBeGreaterThan(0);
    for (const i of large) expect([15, 16, 17, 18, 19, 14, 10]).toContain(i);
    // A short list: every assigned photo also floats (the first 7 are the large pass-bys).
    for (const f of g.robots.floaters.filter((x) => x.size < 0.8)) expect(scenes.floaters).toContain(f.photoIndex);
    for (const i of [5, 3, 9, 7, 2, 13, ...large]) expect(g.featured).toContain(i);
  });

  it('keeps the floating photos varied for small archives with the default scenes', () => {
    for (const n of [8, 10, 15]) {
      const sequence = buildSequence({ photoCount: n, lengthMode: 'auto', musicDuration: null });
      const g = computeGallery({ sequence, aspects: Array.from({ length: n }, () => 1.5), portraitIndex: 0, seed: 7 });
      const small = new Set(g.robots.floaters.filter((f) => f.size < 0.8).map((f) => f.photoIndex));
      expect(small.size, `n=${n}`).toBe(n);
    }
  });

  it('rotates grid photos beyond the first 30 into the grid over time', () => {
    const n = 60;
    const sequence = buildSequence({ photoCount: n, lengthMode: 'auto', musicDuration: null });
    const aspects = Array.from({ length: n }, () => 1.5);
    const grid = Array.from({ length: 40 }, (_, i) => 59 - i);
    const g = computeGallery({ sequence, aspects, portraitIndex: 0, seed: 7, scenes: { grid } });
    const cells = g.hall!.grid.cells;
    expect(cells.map((c) => c.photos[0])).toEqual(grid.slice(0, 30));
    const later = new Set(cells.flatMap((c) => c.photos));
    expect([...later].some((p) => grid.slice(30).includes(p))).toBe(true);
    for (const p of later) expect(grid).toContain(p);
  });

  it('walls never cross, in every cut', () => {
    for (const c of CUTS) {
      const { gallery } = make(20, c.mode, c.music);
      for (const region of ['walk', 'robots'] as const) {
        const walls = gallery.walls.filter((w) => w.region === region);
        for (let i = 0; i < walls.length; i++) {
          for (let j = i + 1; j < walls.length; j++) expect(cross(ends(walls[i]), ends(walls[j])), `${c.mode}/${c.music}: ${walls[i].name} × ${walls[j].name}`).toBe(false);
        }
      }
    }
  });

  it('the camera keeps 1 m from every wall and never enters an obstacle before the dive, in every cut', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      const robots = requireSegment(sequence, 'robots');
      const dive = requireSegment(sequence, 'dive');
      for (let t = 0; t < dive.start; t += 0.25) {
        const p = gallery.track.pos.at(t);
        const region = t < robots.start ? 'walk' : 'robots';
        for (const w of gallery.walls.filter((x) => x.region === region)) {
          expect(distance(p, ends(w)), `${c.mode}/${c.music}: ${w.name} at t=${t}`).toBeGreaterThan(1);
        }
        expect(insideObstacle(gallery, p, t, region)?.name, `${c.mode}/${c.music}: t=${t}`).toBeUndefined();
      }
    }
  });

  it('three photos still fill every room with valid photos', () => {
    const { gallery } = make(3);
    expect(gallery.location!.boxes).toHaveLength(3);
    expect(gallery.portraits!.items.length).toBeGreaterThan(0);
    const hall = gallery.hall!;
    for (const cell of hall.grid.cells) for (const p of cell.photos) expect(p).toBeLessThan(3);
    for (const s of hall.crts.screens) expect(s.photoIndex).toBeLessThan(3);
    expect(gallery.finale.network.nodes).toHaveLength(MIN_NETWORK_NODES);
    expect(new Set(gallery.featured).size).toBe(gallery.featured.length);
    for (const f of gallery.featured) expect(f).toBeLessThan(3);
  });

  it('500 photos keep every index valid', () => {
    const { gallery } = make(500);
    expect(gallery.photos.items.length).toBeLessThanOrEqual(MAX_WALL_PHOTOS);
    const all = [...gallery.photos.items.map((i) => i.photoIndex), ...gallery.robots.floaters.map((f) => f.photoIndex), ...gallery.hall!.grid.cells.flatMap((c) => c.photos)];
    for (const i of all) expect(i >= 0 && i < 500).toBe(true);
  });

  it('the grid swaps at most two cells per step and its table covers the whole hall', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      if (!gallery.hall) continue;
      const { cells, step, start } = gallery.hall.grid;
      expect(cells).toHaveLength(HALL.grid.cols * HALL.grid.rows);
      const steps = cells[0].photos.length;
      expect(start + (steps - 1) * step).toBeGreaterThanOrEqual(requireSegment(sequence, 'robots').start - step);
      for (let k = 1; k < steps; k++) expect(cells.filter((cell) => cell.photos[k] !== cell.photos[k - 1]).length).toBeLessThanOrEqual(2);
    }
  });

  it('numbers the labels like the original and renumbers shorter cuts', () => {
    const names = (g: Gallery) => g.labels.map((l) => `${l.text} ${l.number}`);
    expect(names(make().gallery)).toEqual(['Friends 1', 'Photos 2', 'Location 3', 'Words 4', 'Likes 5.1', 'Photos 5.2', 'Videos 5.3']);
    expect(names(make(20, 60).gallery)).toEqual(['Friends 1', 'Photos 2', 'Words 3']);
    expect(names(make(20, 30).gallery)).toEqual(['Photos 1']);
  });

  it('puts the finale in a frame centred on the platform and aligned with it', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      const { frame } = gallery.finale;
      const centre = toWorld(gallery.robots.frame, [gallery.robots.platform.center[0], 0, gallery.robots.platform.center[2]]);
      expect(frame.origin[0]).toBeCloseTo(centre[0], 9);
      expect(frame.origin[2]).toBeCloseTo(centre[2], 9);
      expect(gallery.robots.platform.center[2]).toBeCloseTo(gallery.track.anchors.platformZ, 12);
      expect(gallery.finale.carpet[0]).toBe(0);
      expect(gallery.finale.carpet[2]).toBe(0);
      expect(gallery.finale.carpetYaw).toBe(0);
      const dive = requireSegment(sequence, 'dive');
      const cam = toLocal(frame, gallery.track.pos.at(dive.start));
      // The orbit ends 30° round the platform; the dive then swings back onto the platform's axis.
      expect(Math.atan2(cam[0], cam[2]), `${c.mode}/${c.music}`).toBeCloseTo(TRACK.robots.orbit, 1);
      expect(Math.hypot(cam[0], cam[2])).toBeCloseTo(TRACK.robots.dEnd, 0);
    }
  });

  it('fills the robot room with photos at every height; a few large ones pass beside the camera', () => {
    const { sequence, gallery } = make(40);
    const F = gallery.robots.frame;
    const robots = requireSegment(sequence, 'robots');
    const dive = requireSegment(sequence, 'dive');
    const path: Vec3[] = [];
    for (let t = robots.start; t <= dive.start; t += 0.25) path.push(toLocal(F, gallery.track.pos.at(t)));
    const f = gallery.robots.floaters;
    const low = f.filter((x) => x.pos[1] < 0.8).length / f.length;
    const high = f.filter((x) => x.pos[1] > 4).length / f.length;
    expect(low).toBeGreaterThan(0.12);
    expect(high).toBeGreaterThan(0.15);
    const clearance = (p: Vec3) => Math.min(...path.map((c) => Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2])));
    const large = f.filter((x) => x.size >= 0.8);
    expect(large.length).toBeGreaterThanOrEqual(6);
    expect(large.length).toBeLessThanOrEqual(12);
    for (const x of large) {
      expect(clearance(x.pos)).toBeGreaterThan(1.2);
      expect(clearance(x.pos)).toBeLessThan(4);
    }
    for (const x of f) expect(clearance(x.pos)).toBeGreaterThan(0.8);
  });

  it('network spokes reach nodes below and above the core', () => {
    const { gallery } = make();
    const net = gallery.finale.network;
    const spokes = net.edges.filter(([a]) => a === -1).map(([, b]) => net.nodes[b].pos[1]);
    expect(spokes.some((y) => y > 0)).toBe(true);
    expect(spokes.some((y) => y < 0)).toBe(true);
  });

  it('is deterministic', () => {
    const a = make(20);
    const b = make(20);
    const strip = (g: Gallery) => JSON.stringify({ ...g, track: null });
    expect(strip(a.gallery)).toBe(strip(b.gallery));
    expect(findSegment(a.sequence, 'likes')).not.toBeNull();
  });
});

