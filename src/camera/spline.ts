import type { Vec3 } from '../types';

export interface SplineKey {
  t: number;
  value: Vec3;
  /** Explicit derivative at this key; otherwise Catmull-Rom (interior) or zero (ends). */
  velocity?: Vec3;
}

export interface Spline {
  readonly start: number;
  readonly end: number;
  at(t: number): Vec3;
}

export function createSpline(keys: SplineKey[]): Spline {
  if (keys.length < 2) throw new Error('a spline needs at least two keys');
  for (let i = 1; i < keys.length; i++) if (!(keys[i].t > keys[i - 1].t)) throw new Error(`spline key times must increase (index ${i})`);
  const tangents: Vec3[] = keys.map((k, i) => {
    if (k.velocity) return k.velocity;
    if (i === 0 || i === keys.length - 1) return [0, 0, 0];
    const p = keys[i - 1];
    const n = keys[i + 1];
    const dt = n.t - p.t;
    return [(n.value[0] - p.value[0]) / dt, (n.value[1] - p.value[1]) / dt, (n.value[2] - p.value[2]) / dt];
  });
  const first = keys[0].t;
  const last = keys[keys.length - 1].t;
  return {
    start: first,
    end: last,
    at(t) {
      const tc = Math.min(last, Math.max(first, t));
      let lo = 0;
      let hi = keys.length - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (keys[mid].t <= tc) lo = mid;
        else hi = mid - 1;
      }
      const a = keys[lo];
      const b = keys[lo + 1];
      const h = b.t - a.t;
      const u = (tc - a.t) / h;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const m0 = tangents[lo];
      const m1 = tangents[lo + 1];
      const at = (j: 0 | 1 | 2) => h00 * a.value[j] + h10 * h * m0[j] + h01 * b.value[j] + h11 * h * m1[j];
      return [at(0), at(1), at(2)];
    },
  };
}
