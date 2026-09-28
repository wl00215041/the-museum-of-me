import { describe, expect, it } from 'vitest';
import { createCameraPath, type Keyframe } from '../../src/camera/hermite';
import type { Vec3 } from '../../src/types';

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
