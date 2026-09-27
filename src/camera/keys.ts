import { EYE, ROOM_GAP, roomCenterZ, type Layout, type Room } from '../museum/layout';
import type { SceneSpan, Timeline, Vec3 } from '../types';
import { clamp } from '../util/math';
import type { Keyframe } from './hermite';

export interface Waypoint {
  pos: Vec3;
  target: Vec3;
  /** Seconds to rest on this waypoint. */
  dwell?: number;
}

const PAN_WEIGHT = 1.2;
const MIN_WEIGHT = 0.05;
const MAX_DWELL_SHARE = 0.8;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

function direction(w: Waypoint): Vec3 {
  const d = sub(w.target, w.pos);
  const l = norm(d) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

const angle = (a: Vec3, b: Vec3): number => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));

/** The doorway leading out of `room`, centred in the wall gap. */
export function doorWaypoint(room: Room): Waypoint {
  const z = room.z1 - ROOM_GAP / 2;
  return { pos: [0, EYE, z], target: [0, EYE, z - 8] };
}

export function allocateKeys(start: number, end: number, points: Waypoint[]): Keyframe[] {
  if (points.length === 0) throw new Error('a scene needs at least one waypoint');
  const span = end - start;
  let dwells = points.map((p) => Math.max(0, p.dwell ?? 0));
  const dwellSum = dwells.reduce((a, b) => a + b, 0);
  if (dwellSum > span * MAX_DWELL_SHARE) dwells = dwells.map((d) => (d * span * MAX_DWELL_SHARE) / dwellSum);
  const move = span - dwells.reduce((a, b) => a + b, 0);
  const weights = points
    .slice(1)
    .map((p, i) => MIN_WEIGHT + norm(sub(p.pos, points[i].pos)) + PAN_WEIGHT * angle(direction(points[i]), direction(p)));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const keys: Keyframe[] = [];
  let t = start;
  points.forEach((p, i) => {
    const hold = dwells[i] > 0;
    keys.push({ t, pos: p.pos, target: p.target, hold });
    if (hold) {
      t += dwells[i];
      keys.push({ t, pos: p.pos, target: p.target, hold: true });
    }
    if (i < weights.length) t += (move * weights[i]) / weightSum;
  });
  keys[keys.length - 1].t = end;
  return keys;
}

function sceneWaypoints(span: SceneSpan, room: Room, layout: Layout, timeline: Timeline): Waypoint[] {
  const d = span.end - span.start;
  const zc = roomCenterZ(room);
  const { z0, z1 } = room;
  switch (span.id) {
    case 'opening':
      return [
        { pos: [0, EYE, z0 - 2.5], target: [0, 4.6, z1], dwell: 0.35 * d },
        { pos: [0, EYE, z0 - 5.5], target: [0, 3.4, z1] },
      ];
    case 'hall': {
      const p = layout.hallPortrait.center;
      return [
        { pos: [-0.8, EYE, z0 - 4], target: p },
        { pos: [-1.3, EYE, zc + 0.4], target: p, dwell: 0.3 * d }, // ~5.7 from the wall frames the whole portrait
        { pos: [-1.0, EYE, z1 + 3.5], target: [0, EYE, z1 - 4] },
      ];
    }
    case 'corridor':
      return [
        { pos: [0, EYE, z0 - 2], target: [0.9, 1.9, z0 - 8] },
        { pos: [0, EYE, z1 + 2], target: [-0.9, 1.9, z1 - 4] },
      ];
    case 'gallery':
      return layout.galleryStops.map((stop, k) => {
        const s = timeline.galleryStops[k];
        return { pos: stop.camera, target: stop.target, dwell: clamp((s.end - s.start) * 0.25, 0.5, 5) };
      });
    case 'keywords':
      return [
        { pos: [0, EYE, z0 - 2.5], target: [0, 4.2, zc] },
        { pos: [3.2, 2.0, zc + 2.5], target: [0, 4.4, zc - 1] },
        { pos: [-3.0, 2.0, zc - 2.0], target: [0, 4.4, zc - 2] },
        { pos: [-0.8, EYE, z1 + 2.5], target: [0, EYE, z1 - 4] },
      ];
    case 'network': {
      if (!layout.network) throw new Error('network scene without a network layout');
      const c = layout.network.center;
      return [
        { pos: [0, EYE, z0 - 2.5], target: c },
        { pos: [5.2, 2.6, zc + 2.2], target: c },
        { pos: [5.4, 3.0, zc - 2.4], target: c },
        { pos: [1.8, EYE, z1 + 2.2], target: [0, EYE, z1 - 4] },
      ];
    }
    case 'finale': {
      const p = layout.finalePortrait.center;
      return [
        { pos: [0, EYE, z0 - 2.5], target: [0, 3.4, z1] },
        { pos: [0.1, 1.62, z1 + 9], target: [p[0], 3.3, p[2]], dwell: 0.45 * d },
      ];
    }
  }
}

export function buildCameraKeys(timeline: Timeline, layout: Layout): Keyframe[] {
  if (timeline.scenes.length !== layout.rooms.length) throw new Error('layout does not match the timeline');
  const keys: Keyframe[] = [];
  const last = timeline.scenes.length - 1;
  timeline.scenes.forEach((span, i) => {
    const room = layout.rooms[i];
    const points: Waypoint[] = [];
    if (i > 0) points.push(doorWaypoint(layout.rooms[i - 1]));
    points.push(...sceneWaypoints(span, room, layout, timeline));
    if (i < last) points.push(doorWaypoint(room));
    for (const k of allocateKeys(span.start, span.end, points)) {
      const prev = keys[keys.length - 1];
      if (prev && Math.abs(prev.t - k.t) < 1e-9) continue; // shared doorway key between scenes
      keys.push(k);
    }
  });
  return keys;
}
