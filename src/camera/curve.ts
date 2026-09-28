import type { Vec3 } from '../types';
import { createSpline } from './spline';

export interface CurveKey {
  t: number;
  v: number;
  /** Explicit slope; otherwise Catmull-Rom inside and zero at the ends. */
  slope?: number;
}

export interface Curve {
  at(t: number): number;
}

export function curve(keys: CurveKey[]): Curve {
  const spline = createSpline(keys.map((k) => ({ t: k.t, value: [k.v, 0, 0] as Vec3, ...(k.slope === undefined ? {} : { velocity: [k.slope, 0, 0] as Vec3 }) })));
  return { at: (t) => spline.at(t)[0] };
}

/** Running integral of `f` from `t0` (trapezoids); constant outside [t0, t1]. */
export function integral(f: (t: number) => number, t0: number, t1: number, steps = 400): Curve {
  if (!(t1 > t0)) return { at: () => 0 };
  const h = (t1 - t0) / steps;
  const acc = [0];
  for (let i = 1; i <= steps; i++) acc.push(acc[i - 1] + ((f(t0 + (i - 1) * h) + f(t0 + i * h)) / 2) * h);
  return {
    at(t) {
      const u = Math.min(steps, Math.max(0, (t - t0) / h));
      const i = Math.min(steps - 1, Math.floor(u));
      return acc[i] + (acc[i + 1] - acc[i]) * (u - i);
    },
  };
}
