import { describe, expect, it } from 'vitest';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import { BOUNDARY, CARPET, LINE, TEXT, computeStrip, roomAtX, yawAt, type Strip } from '../../src/stage/strip';
import type { LengthMode } from '../../src/types';
import { MIN_NETWORK_NODES } from '../../src/stage/placement';

const aspectsFor = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78, 0.5][i % 5]);

function make(n: number, lengthMode: LengthMode = 'auto', name = '') {
  const sequence = buildSequence({ photoCount: n, lengthMode, musicDuration: null });
  return { sequence, strip: computeStrip({ sequence, aspects: aspectsFor(n), portraitIndex: Math.min(1, n - 1), seed: 3 + name.length }) };
}

const allFinite = (v: unknown): boolean =>
  typeof v === 'number' ? Number.isFinite(v)
  : Array.isArray(v) ? v.every(allFinite)
  : v !== null && typeof v === 'object' ? Object.values(v).every(allFinite)
  : true;

function inRoom(strip: Strip, id: string, x: number): boolean {
  const room = strip.rooms.find((r) => r.id === id)!;
  return x >= room.x0 - 1e-9 && x <= room.x1 + 1e-9;
}

describe('computeStrip', () => {
  it('lays the rooms side by side along +x in the original order', () => {
    const { strip, sequence } = make(20);
    expect(strip.rooms.map((r) => r.id)).toEqual(['wall', 'portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots']);
    for (let i = 1; i < strip.rooms.length; i++) expect(strip.rooms[i].x0).toBeCloseTo(strip.rooms[i - 1].x1, 9);
    expect(strip.boundaries).toHaveLength(strip.rooms.length - 1);
    expect(strip.rooms[0].x0).toBe(0);
    expect(strip.speed).toBe(LINE.baseSpeed);
    expect(strip.rooms[1].x0).toBeCloseTo(strip.speed * requireSegment(sequence, 'portraits').start, 9);
    expect(strip.walkEnd).toBe(requireSegment(sequence, 'robots').end);
    expect(strip.rooms.map((r) => r.dark)).toEqual([false, false, false, true, true, true, true, false]);
  });

  it('centres the exhibition text on the camera at t_ex, with the yaw already zero', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      const { strip } = make(12, mode);
      expect(strip.wall.exhibition.center[0]).toBeCloseTo(strip.speed * strip.tEx, 9);
      expect(yawAt(strip, strip.tEx)).toBe(0);
      expect(yawAt(strip, 0)).toBeCloseTo(LINE.yaw0, 12);
      expect(strip.tPar).toBeLessThan(strip.tEx);
    }
  });

  it('wall texts never overlap and stay inside the wall room', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      for (const n of [3, 20, 500]) {
        const { strip } = make(n, mode);
        const { title, exhibition, intro } = strip.wall;
        const wallEnd = strip.rooms[0].x1;
        expect(title.center[0] + TEXT.titleWidth / 2 + TEXT.gap).toBeLessThanOrEqual(exhibition.center[0] - TEXT.exhibitionWidth / 2 + 1e-9);
        const lastRight = intro ? intro.center[0] + intro.width / 2 : exhibition.center[0] + TEXT.exhibitionWidth / 2;
        if (intro) expect(intro.avatar.center[0] - intro.avatar.width / 2).toBeGreaterThanOrEqual(exhibition.center[0] + TEXT.exhibitionWidth / 2 + TEXT.gap - 1e-9);
        expect(lastRight + TEXT.endMargin).toBeLessThanOrEqual(wallEnd + 1e-9);
      }
    }
  });

  it('keeps every exhibit inside its own room', () => {
    const { strip } = make(40);
    for (const item of strip.portraits!.items) expect(inRoom(strip, 'portraits', item.center[0])).toBe(true);
    for (const item of strip.photos.items) expect(inRoom(strip, 'photos', item.center[0])).toBe(true);
    for (const box of strip.moments!.boxes) expect(inRoom(strip, 'moments', box.center[0])).toBe(true);
    expect(inRoom(strip, 'words', strip.words!.wall.center[0])).toBe(true);
    expect(inRoom(strip, 'likes', strip.likes!.sculpture[0])).toBe(true);
    for (const m of strip.likes!.monitors) expect(inRoom(strip, 'likes', m.center[0])).toBe(true);
    for (const p of strip.videos!.panels) expect(inRoom(strip, 'videos', p.center[0])).toBe(true);
    for (const m of strip.videos!.monitors) expect(inRoom(strip, 'videos', m.center[0])).toBe(true);
    expect(inRoom(strip, 'robots', strip.robots.platform.center[0])).toBe(true);
    expect(strip.words!.wall.center[2]).toBeLessThan(-4.9);
  });

  it('puts a pillar at every boundary except the low one after the push-in', () => {
    const { strip } = make(20, 60);
    const low = strip.boundaries.filter((b) => b.low);
    expect(low.map((b) => b.left.id)).toEqual(['words']);
    expect(strip.obstacles.filter((o) => o.name === 'pillar')).toHaveLength(strip.boundaries.length - 1);
    expect(strip.obstacles.filter((o) => o.name === 'partition')).toHaveLength(strip.boundaries.length);
    for (const o of strip.obstacles.filter((o) => o.name === 'pillar')) expect(o.max[2]).toBeLessThan(LINE.z - 1);
    expect(BOUNDARY.lowDepth).toBeLessThan(1);
  });

  it('30 s cut: wall, photos and the robot room, with the carpet and finale', () => {
    const { strip } = make(20, 30);
    expect(strip.rooms.map((r) => r.id)).toEqual(['wall', 'photos', 'robots']);
    expect(strip.wall.intro).toBeNull();
    expect(strip.portraits).toBeNull();
    expect(strip.moments).toBeNull();
    expect(strip.finale.lifted[1]).toBeGreaterThan(strip.robots.platform.center[1]);
    expect(strip.featured).toEqual([strip.portraitIndex]);
  });

  it('three photos still fill every room', () => {
    const { strip } = make(3);
    expect(strip.moments!.boxes.length).toBeGreaterThanOrEqual(4);
    expect(strip.portraits!.items.length).toBeGreaterThan(0);
    // The original's friend network is a dense constellation: few photos are reused, never the portrait.
    expect(strip.finale.network.nodes).toHaveLength(MIN_NETWORK_NODES);
    for (const node of strip.finale.network.nodes) expect(node.photoIndex).not.toBe(strip.portraitIndex);
    expect(allFinite(strip)).toBe(true);
  });

  it('the carpet sits on the platform; the lift point is above it', () => {
    const { strip } = make(20);
    const p = strip.robots.platform;
    expect(strip.finale.carpet[1]).toBeCloseTo(p.height + 0.006, 9);
    expect(CARPET.cols * CARPET.pitch).toBeLessThanOrEqual(p.width);
    expect(CARPET.rows * CARPET.pitch).toBeLessThanOrEqual(p.depth);
  });

  it('roomAtX clamps to the first and last room', () => {
    const { strip } = make(20);
    expect(roomAtX(strip, -5).id).toBe('wall');
    expect(roomAtX(strip, 1e6).id).toBe('robots');
    expect(roomAtX(strip, strip.rooms[3].x0 + 0.1).id).toBe('moments');
  });

  it('is deterministic', () => {
    expect(make(30).strip).toEqual(make(30).strip);
  });
});
