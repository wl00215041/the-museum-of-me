import { describe, expect, it } from 'vitest';
import { createCameraPath, type Keyframe } from '../../src/camera/hermite';
import { allocateKeys, buildCameraKeys } from '../../src/camera/keys';
import { DOOR, KEYWORDS, NETWORK, computeLayout, getRoom, type Layout } from '../../src/museum/layout';
import { buildTimeline } from '../../src/plan/timeline';
import type { DurationMode, Vec3 } from '../../src/types';

const key = (t: number, pos: Vec3, hold = false): Keyframe => ({ t, pos, target: [pos[0], pos[1], pos[2] - 5], hold });
const round = (v: Vec3) => v.map((x) => +x.toFixed(9));

describe('createCameraPath', () => {
  it('passes through every keyframe', () => {
    const keys = [key(0, [0, 0, 0], true), key(1, [1, 0, 0]), key(3, [1, 2, 0]), key(4, [0, 2, 0], true)];
    const path = createCameraPath(keys);
    for (const k of keys) expect(round(path.poseAt(k.t).pos)).toEqual(k.pos);
  });

  it('stays still between two hold keys at the same position', () => {
    const path = createCameraPath([key(0, [0, 0, 0]), key(1, [2, 0, 0], true), key(3, [2, 0, 0], true), key(4, [5, 0, 0])]);
    for (const t of [1, 1.5, 2, 2.9, 3]) expect(path.poseAt(t).pos[0]).toBeCloseTo(2, 9);
  });

  it('has continuous velocity through pass-through keys', () => {
    const path = createCameraPath([key(0, [0, 0, 0], true), key(1.3, [2, 1, 0]), key(2, [3, 1, -2]), key(4, [3, 4, -2], true)]);
    const d = 1e-5;
    const diff = (a: number, b: number) => {
      const p = path.poseAt(a).pos;
      const q = path.poseAt(b).pos;
      return q.map((v, i) => (v - p[i]) / (b - a));
    };
    for (const t of [1.3, 2]) {
      const left = diff(t - d, t);
      const right = diff(t, t + d);
      left.forEach((v, i) => expect(v).toBeCloseTo(right[i], 3));
    }
  });

  it('clamps outside the keyed range', () => {
    const path = createCameraPath([key(0, [0, 0, 0]), key(2, [4, 0, 0])]);
    expect(round(path.poseAt(-1).pos)).toEqual([0, 0, 0]);
    expect(round(path.poseAt(99).pos)).toEqual([4, 0, 0]);
    expect(path.duration).toBe(2);
  });

  it('rejects non-increasing keyframe times and too few keys', () => {
    expect(() => createCameraPath([key(0, [0, 0, 0]), key(0, [1, 0, 0])])).toThrow();
    expect(() => createCameraPath([key(0, [0, 0, 0])])).toThrow();
  });
});

describe('allocateKeys', () => {
  it('spans the scene exactly and honours dwell times', () => {
    const keys = allocateKeys(10, 20, [
      { pos: [0, 1.6, 0], target: [0, 1.6, -5] },
      { pos: [0, 1.6, -6], target: [0, 1.6, -11], dwell: 3 },
      { pos: [0, 1.6, -12], target: [0, 1.6, -17] },
    ]);
    expect(keys[0].t).toBe(10);
    expect(keys.at(-1)!.t).toBe(20);
    const holds = keys.filter((k) => k.hold);
    expect(holds).toHaveLength(2);
    expect(holds[1].t - holds[0].t).toBeCloseTo(3, 9);
    for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThan(keys[i - 1].t);
  });

  it('splits movement time in proportion to distance', () => {
    const keys = allocateKeys(0, 10, [
      { pos: [0, 0, 0], target: [0, 0, -1] },
      { pos: [0, 0, -2], target: [0, 0, -3] },
      { pos: [0, 0, -8], target: [0, 0, -9] },
    ]);
    // weights are 0.05 + distance: 2.05 and 6.05
    expect(keys[1].t).toBeCloseTo((10 * 2.05) / 8.1, 9);
  });

  it('scales dwell down when it would exceed 80% of the scene', () => {
    const keys = allocateKeys(0, 5, [
      { pos: [0, 0, 0], target: [0, 0, -1], dwell: 10 },
      { pos: [0, 0, -4], target: [0, 0, -5] },
    ]);
    expect(keys[1].t - keys[0].t).toBeCloseTo(4, 9);
  });
});

const SCENARIOS: [number, DurationMode, boolean][] = [
  [3, 'auto', true], [10, 'auto', true], [41, 'auto', false], [60, 'auto', true],
  [3, 30, false], [60, 30, true], [12, 60, false], [5, 90, true], [60, 120, true],
];

function scenario(n: number, durationMode: DurationMode, hasKeywords: boolean) {
  const timeline = buildTimeline({ photoCount: n, durationMode, hasKeywords });
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78][i % 4]);
  const layout = computeLayout({ timeline, aspects, portraitIndex: 0, keywords: hasKeywords ? ['一', 'two', '三四五'] : [], seed: 3 });
  const keys = buildCameraKeys(timeline, layout);
  return { timeline, layout, keys, path: createCameraPath(keys), label: `${n} photos / ${durationMode} / kw=${hasKeywords}` };
}

function violation(layout: Layout, [x, y, z]: Vec3): string | null {
  const inDoor = Math.abs(x) <= DOOR.width / 2 - 0.25 && y >= 0.3 && y <= DOOR.height - 0.25;
  const room = layout.rooms.find((r) => z <= r.z0 && z >= r.z1);
  if (!room) return inDoor ? null : `between rooms outside the doorway (x=${x.toFixed(2)}, y=${y.toFixed(2)})`;
  if (Math.abs(x) > room.width / 2 - 0.35) return `too close to a side wall of ${room.id} (x=${x.toFixed(2)})`;
  if (y < 0.3 || y > room.height - 0.3) return `outside floor/ceiling of ${room.id} (y=${y.toFixed(2)})`;
  const nearEnd = room.z0 - z < 0.35 || z - room.z1 < 0.35;
  if (nearEnd && !inDoor) return `too close to an end wall of ${room.id} (x=${x.toFixed(2)}, z=${z.toFixed(2)})`;
  return null;
}

describe('buildCameraKeys', () => {
  it('covers the whole timeline with strictly increasing keys', () => {
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, keys } = scenario(n, mode, kw);
      expect(keys[0].t).toBe(0);
      expect(keys.at(-1)!.t).toBeCloseTo(timeline.total, 9);
      for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThan(keys[i - 1].t);
    }
  });

  it('never leaves the rooms or clips a wall', () => {
    const problems: string[] = [];
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, layout, path, label } = scenario(n, mode, kw);
      for (let t = 0; t <= timeline.total; t += 0.05) {
        const v = violation(layout, path.poseAt(t).pos);
        if (v) problems.push(`${label} t=${t.toFixed(2)}: ${v}`);
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('keeps clear of the network sphere', () => {
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, layout, path } = scenario(n, mode, kw);
      if (!layout.network) continue;
      const span = timeline.scenes.find((s) => s.id === 'network')!;
      const c = layout.network.center;
      for (let t = span.start; t <= span.end; t += 0.05) {
        const [x, y, z] = path.poseAt(t).pos;
        expect(Math.hypot(x - c[0], y - c[1], z - c[2])).toBeGreaterThan(NETWORK.radius + 0.9);
      }
    }
  });

  it('passes underneath the hanging keywords', () => {
    const { layout, path, timeline } = scenario(10, 'auto', true);
    const room = getRoom(layout, 'keywords');
    for (let t = 0; t <= timeline.total; t += 0.05) {
      const [, y, z] = path.poseAt(t).pos;
      if (z <= room.z0 && z >= room.z1) expect(y).toBeLessThan(KEYWORDS.minY - 0.8);
    }
  });

  it('moves calmly in auto mode and sanely in every mode', () => {
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, path, label } = scenario(n, mode, kw);
      const dt = 0.05;
      let max = 0;
      for (let t = 0; t + dt <= timeline.total; t += dt) {
        const a = path.poseAt(t).pos;
        const b = path.poseAt(t + dt).pos;
        max = Math.max(max, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dt);
      }
      expect(max, label).toBeLessThan(mode === 'auto' ? 5 : 9);
    }
  });
});
