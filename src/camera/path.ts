import { findSegment, localU, requireSegment } from '../plan/sequence';
import { LINE, PUSH, roomAtX, yawAt, type Strip } from '../stage/strip';
import type { Sequence, Vec3 } from '../types';
import { smoothstep } from '../util/math';
import { createSpline, type SplineKey } from './spline';

export interface PathPose {
  pos: Vec3;
  target: Vec3;
  fov: number;
  /** Distance to keep in focus (depth of field). */
  focus: number;
}

export interface CameraPath {
  readonly duration: number;
  poseAt(t: number): PathPose;
}

/** Depth of the walking line: the Words push-in, then the pull-back in the following segment. */
export function lineZ(sequence: Sequence, t: number): number {
  const words = findSegment(sequence, 'words');
  if (!words) return LINE.z;
  if (t <= words.end) return LINE.z - (LINE.z - PUSH.z) * smoothstep(PUSH.start, PUSH.end, localU(words, t));
  const next = sequence.segments[sequence.segments.indexOf(words) + 1];
  return PUSH.z + (LINE.z - PUSH.z) * smoothstep(0, PUSH.pullBack, localU(next, t));
}

const sub = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function buildCameraPath(sequence: Sequence, strip: Strip): CameraPath {
  const V = strip.speed;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const P = strip.robots.platform.center;
  const C = strip.finale.lifted;
  const d = dive.end - dive.start;
  const m = mosaic.end - mosaic.start;
  const x0 = V * dive.start;
  const z0 = lineZ(sequence, dive.start);

  const posKeys: SplineKey[] = [
    { t: dive.start, value: [x0, LINE.eye, z0], velocity: [V, 0, 0] },
    { t: dive.start + 0.35 * d, value: [P[0] - 2.6, 1.35, P[2] + 3.8] },
    { t: dive.start + 0.7 * d, value: [P[0] - 0.6, 0.95, P[2] + 1.6] },
    { t: dive.end, value: [P[0], 4.2, P[2] + 1.2] },
    // As in the original: by a third of the mosaic the whole lifted carpet is in frame, then it shrinks away from the lens.
    { t: mosaic.start + 0.35 * m, value: [C[0], C[1] + 11, C[2] + 7] },
    { t: mosaic.end, value: [C[0], C[1] + 8.5, C[2] + 5] },
  ];
  const targetKeys: SplineKey[] = [
    { t: dive.start, value: [x0, LINE.lookY, z0 - 10], velocity: [V, 0, 0] },
    { t: dive.start + 0.35 * d, value: [P[0], 0.6, P[2]] },
    { t: dive.start + 0.7 * d, value: [P[0] + 3, 0.4, P[2] - 0.6] },
    { t: dive.end, value: [P[0], 0.4, P[2]] },
    { t: mosaic.start + 0.35 * m, value: C },
    { t: mosaic.end, value: C },
  ];
  if (network) {
    const n = network.end - network.start;
    // Through the outer nodes to the star shell (radius ~12), then back until the whole sphere fills the frame.
    posKeys.push({ t: network.start + 0.5 * n, value: [C[0] + 3, C[1] + 10, C[2] + 7] }, { t: network.end, value: [C[0], C[1] + 22, C[2] + 15.5] });
    targetKeys.push({ t: network.start + 0.5 * n, value: C }, { t: network.end, value: C });
  }
  const pos = createSpline(posKeys);
  const target = createSpline(targetKeys);
  const card = strip.finale.card;

  return {
    duration: sequence.total,
    poseAt(t) {
      if (t >= ending.start) {
        return { pos: [card[0], card[1], card[2] + 6.2], target: [card[0], card[1] - 0.2, card[2]], fov: 35, focus: 6.2 };
      }
      if (t < dive.start) {
        const x = V * t;
        const z = lineZ(sequence, t);
        const yaw = yawAt(strip, t);
        const room = roomAtX(strip, x);
        return {
          pos: [x, LINE.eye, z],
          target: [x + 10 * Math.sin(yaw), LINE.lookY, z - 10 * Math.cos(yaw)],
          fov: LINE.fov,
          focus: Math.max(1, (z - room.backZ) / Math.cos(yaw)),
        };
      }
      const p = pos.at(t);
      const q = target.at(t);
      return { pos: p, target: q, fov: 40, focus: Math.max(0.8, sub(p, q)) };
    },
  };
}
