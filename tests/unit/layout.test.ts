import { describe, expect, it } from 'vitest';
import {
  CORRIDOR, GALLERY, KEYWORDS, NETWORK, ROOM_GAP, computeLayout, estimateTextWidth, fitFramed, framedOuter, getRoom,
} from '../../src/museum/layout';
import { buildTimeline } from '../../src/plan/timeline';
import type { DurationMode } from '../../src/types';

const aspectsFor = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78, 0.5][i % 5]);

function make(n: number, durationMode: DurationMode = 'auto', keywords: string[] = ['勇氣', 'travel', '家人']) {
  const timeline = buildTimeline({ photoCount: n, durationMode, hasKeywords: keywords.length > 0 });
  return { timeline, layout: computeLayout({ timeline, aspects: aspectsFor(n), portraitIndex: 2 % n, keywords, seed: 7 }) };
}

describe('fitFramed', () => {
  it('keeps the framed outer size inside the box and preserves the aspect ratio', () => {
    for (const aspect of [0.3, 0.5, 0.75, 1, 4 / 3, 1.5, 2, 4]) {
      for (const [w, h] of [[0.86, 0.86], [3.4, 2.4], [1.55, 1.8], [6, 4.6]]) {
        const size = fitFramed(aspect, w, h);
        const outer = framedOuter(size.width, size.height);
        expect(outer.width).toBeLessThanOrEqual(w + 1e-9);
        expect(outer.height).toBeLessThanOrEqual(h + 1e-9);
        expect(Math.max(w - outer.width, h - outer.height) >= -1e-9).toBe(true);
        expect(Math.min(Math.abs(w - outer.width), Math.abs(h - outer.height))).toBeLessThan(1e-9);
        expect(size.width / size.height).toBeCloseTo(aspect, 9);
      }
    }
  });
});

describe('computeLayout', () => {
  it('lays rooms out in scene order along -Z with a wall gap between them', () => {
    const { timeline, layout } = make(10);
    expect(layout.rooms.map((r) => r.id)).toEqual(timeline.scenes.map((s) => s.id));
    expect(layout.rooms[0].z0).toBe(0);
    for (let i = 1; i < layout.rooms.length; i++) {
      expect(layout.rooms[i].z0).toBeCloseTo(layout.rooms[i - 1].z1 - ROOM_GAP, 9);
    }
    expect(layout.rooms[0].entryDoor).toBe(false);
    expect(layout.rooms.at(-1)!.exitDoor).toBe(false);
    expect(layout.rooms.slice(1).every((r) => r.entryDoor)).toBe(true);
    expect(layout.rooms.slice(0, -1).every((r) => r.exitDoor)).toBe(true);
  });

  it('hangs every photo once in the corridor, inside the room and within its row', () => {
    for (const n of [1, 6, 7, 60]) {
      const { layout } = make(n);
      const room = getRoom(layout, 'corridor');
      expect(layout.corridorSlots.map((s) => s.photoIndex)).toEqual(Array.from({ length: n }, (_, i) => i));
      for (const slot of layout.corridorSlots) {
        const outer = framedOuter(slot.width, slot.height);
        expect(outer.width).toBeLessThanOrEqual(CORRIDOR.outerMax + 1e-9);
        expect(outer.height).toBeLessThanOrEqual(CORRIDOR.outerMax + 1e-9);
        expect(slot.center[2]).toBeLessThan(room.z0 - 0.5);
        expect(slot.center[2]).toBeGreaterThan(room.z1 + 0.5);
        expect(Math.abs(slot.center[0])).toBeCloseTo(CORRIDOR.width / 2, 9);
        expect(slot.normal[0]).toBe(-Math.sign(slot.center[0]));
      }
    }
  });

  it('gallery stops mirror the timeline and stay inside the gallery room without overlapping', () => {
    for (const [n, mode] of [[10, 'auto'], [60, 'auto'], [60, 30], [5, 120]] as const) {
      const { timeline, layout } = make(n, mode);
      const room = getRoom(layout, 'gallery');
      expect(layout.galleryStops.map((s) => s.photoIndices)).toEqual(timeline.galleryStops.map((s) => s.photoIndices));
      let previousMinZ = Infinity;
      for (const stop of layout.galleryStops) {
        expect(stop.width).toBeLessThanOrEqual(GALLERY.groupMaxWidth + 1e-9);
        const zs = [
          ...stop.slots.flatMap((s) => [s.center[2] + framedOuter(s.width, s.height).width / 2, s.center[2] - framedOuter(s.width, s.height).width / 2]),
          stop.plaque.center[2] - stop.plaque.width / 2,
        ];
        const maxZ = Math.max(...zs);
        const minZ = Math.min(...zs);
        expect(maxZ).toBeLessThan(previousMinZ);
        expect(maxZ).toBeLessThan(room.z0);
        expect(minZ).toBeGreaterThan(room.z1);
        previousMinZ = minZ;
        expect(stop.camera[0]).toBeCloseTo(-GALLERY.width / 2 + GALLERY.cameraDistance, 9);
      }
    }
  });

  it('places the hall and finale portraits from the chosen portrait photo', () => {
    const { layout } = make(10);
    expect(layout.hallPortrait.photoIndex).toBe(2);
    expect(layout.finalePortrait.photoIndex).toBe(2);
    expect(layout.hallPortrait.width / layout.hallPortrait.height).toBeCloseTo(1, 9);
    expect(layout.finalePortrait.normal).toEqual([0, 0, 1]);
  });

  it('scatters keywords deterministically inside the keyword volume', () => {
    const words = Array.from({ length: 40 }, (_, i) => (i % 2 ? `word${i}` : `關鍵字${i}`));
    const a = make(10, 'auto', words).layout;
    const b = make(10, 'auto', words).layout;
    expect(a.keywords).toEqual(b.keywords);
    expect(a.keywords).toHaveLength(40);
    const room = getRoom(a, 'keywords');
    const zc = (room.z0 + room.z1) / 2;
    for (const item of a.keywords) {
      expect(Math.abs(item.center[0]) + item.width / 2).toBeLessThanOrEqual(KEYWORDS.halfWidth + 1e-9);
      expect(item.center[1]).toBeGreaterThanOrEqual(KEYWORDS.minY);
      expect(item.center[1]).toBeLessThanOrEqual(KEYWORDS.maxY);
      expect(Math.abs(item.center[2] - zc)).toBeLessThanOrEqual(KEYWORDS.halfDepth);
      expect(item.height).toBeLessThanOrEqual(KEYWORDS.maxHeight);
    }
    expect(a.keywords[0].height).toBeGreaterThan(a.keywords[39].height);
  });

  it('shrinks a very long keyword so it still fits the room width', () => {
    const { layout } = make(5, 'auto', ['這是一段非常非常非常非常非常非常長的關鍵字短語']);
    expect(layout.keywords[0].width).toBeLessThanOrEqual(2 * KEYWORDS.halfWidth - 1 + 1e-9);
  });

  it('builds a network sphere with one node per photo and nearest-neighbour edges', () => {
    for (const n of [1, 2, 3, 60]) {
      const { layout } = make(n);
      const net = layout.network!;
      expect(net.nodes).toHaveLength(n);
      if (n > 1) for (const p of net.nodes) expect(Math.hypot(...p)).toBeCloseTo(NETWORK.radius, 6);
      const keys = net.edges.map(([a, b]) => `${a}-${b}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const [a, b] of net.edges) {
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(n);
      }
      if (n === 1) expect(net.edges).toEqual([]);
      if (n >= 2) {
        const degree = new Array(n).fill(0);
        net.edges.forEach(([a, b]) => { degree[a]++; degree[b]++; });
        expect(Math.min(...degree)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('omits the keyword and network rooms when the timeline drops them', () => {
    const { layout } = make(10, 30);
    expect(layout.keywords).toEqual([]);
    expect(layout.network).toBeNull();
    expect(() => getRoom(layout, 'network')).toThrow();
  });

  it('estimates CJK text wider than latin text of the same length', () => {
    expect(estimateTextWidth('家人朋友')).toBeGreaterThan(estimateTextWidth('abcd'));
  });
});
