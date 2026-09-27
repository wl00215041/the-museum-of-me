import type { Vec3 } from '../types';

export interface Keyframe {
  t: number;
  pos: Vec3;
  target: Vec3;
  /** Zero tangent: the camera comes to rest exactly on this key. */
  hold: boolean;
}

export interface CameraPose {
  pos: Vec3;
  target: Vec3;
}

export interface CameraPath {
  readonly duration: number;
  poseAt(t: number): CameraPose;
}

function tangents(keys: Keyframe[], get: (k: Keyframe) => Vec3): Vec3[] {
  return keys.map((k, i) => {
    if (k.hold || i === 0 || i === keys.length - 1) return [0, 0, 0];
    const p = get(keys[i - 1]);
    const n = get(keys[i + 1]);
    const dt = keys[i + 1].t - keys[i - 1].t;
    return [(n[0] - p[0]) / dt, (n[1] - p[1]) / dt, (n[2] - p[2]) / dt];
  });
}

function segmentIndex(keys: Keyframe[], t: number): number {
  let lo = 0;
  let hi = keys.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function hermite(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, h: number, u: number): Vec3 {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const at = (j: 0 | 1 | 2) => h00 * p0[j] + h10 * h * m0[j] + h01 * p1[j] + h11 * h * m1[j];
  return [at(0), at(1), at(2)];
}

export function createCameraPath(keys: Keyframe[]): CameraPath {
  if (keys.length < 2) throw new Error('camera path needs at least two keyframes');
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i].t > keys[i - 1].t)) throw new Error(`keyframe times must strictly increase (index ${i})`);
  }
  const posTangents = tangents(keys, (k) => k.pos);
  const targetTangents = tangents(keys, (k) => k.target);
  const first = keys[0].t;
  const last = keys[keys.length - 1].t;

  return {
    duration: last,
    poseAt(t: number): CameraPose {
      const tc = Math.min(last, Math.max(first, t));
      const i = segmentIndex(keys, tc);
      const a = keys[i];
      const b = keys[i + 1];
      const h = b.t - a.t;
      const u = (tc - a.t) / h;
      return {
        pos: hermite(a.pos, b.pos, posTangents[i], posTangents[i + 1], h, u),
        target: hermite(a.target, b.target, targetTangents[i], targetTangents[i + 1], h, u),
      };
    },
  };
}
