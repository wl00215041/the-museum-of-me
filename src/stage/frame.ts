import type { Object3D } from 'three';
import type { Vec3 } from '../types';

/**
 * A horizontal frame. Local −z is the view direction `dirOf(yaw)`, local +x is `rightOf(yaw)`, y is up.
 * Walls in a frame lie in its local xy plane and face local +z, so a camera looking along `dirOf(yaw)` sees them head-on.
 */
export interface Frame {
  origin: Vec3;
  yaw: number;
}

export const IDENTITY: Frame = { origin: [0, 0, 0], yaw: 0 };

/** Unit view direction for a heading: yaw 0 looks along −z, positive yaw turns right (towards +x). */
export const dirOf = (yaw: number): Vec3 => [Math.sin(yaw), 0, -Math.cos(yaw)];
export const rightOf = (yaw: number): Vec3 => [Math.cos(yaw), 0, Math.sin(yaw)];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export function toWorldDir(f: Frame, v: Vec3): Vec3 {
  const r = rightOf(f.yaw);
  const d = dirOf(f.yaw);
  return [v[0] * r[0] - v[2] * d[0], v[1], v[0] * r[2] - v[2] * d[2]];
}

export const toWorld = (f: Frame, p: Vec3): Vec3 => add(f.origin, toWorldDir(f, p));

export function toLocalDir(f: Frame, v: Vec3): Vec3 {
  const r = rightOf(f.yaw);
  const d = dirOf(f.yaw);
  return [v[0] * r[0] + v[2] * r[2], v[1], -(v[0] * d[0] + v[2] * d[2])];
}

export const toLocal = (f: Frame, p: Vec3): Vec3 => toLocalDir(f, sub(p, f.origin));

/** Heading of a world direction projected on the ground. */
export const yawOf = (v: Vec3): number => Math.atan2(v[0], -v[2]);

/** Places a three.js object so that its local axes are the frame's. */
export function placeIn<T extends Object3D>(f: Frame, obj: T): T {
  obj.position.set(f.origin[0], f.origin[1], f.origin[2]);
  obj.rotation.set(0, -f.yaw, 0);
  return obj;
}

/** A frame at `localOrigin` of `parent`, turned by `yawOffset` relative to it. */
export const child = (parent: Frame, localOrigin: Vec3, yawOffset = 0): Frame => ({ origin: toWorld(parent, localOrigin), yaw: parent.yaw + yawOffset });
