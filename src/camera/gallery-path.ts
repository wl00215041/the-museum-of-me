import { findSegment, requireSegment } from '../plan/sequence';
import { add, length, scale, sub, toLocal, toLocalDir, toWorld, toWorldDir } from '../stage/frame';
import type { Gallery } from '../stage/gallery';
import type { Sequence, Vec3 } from '../types';
import { lerp, smoothstep } from '../util/math';
import { createSpline, type SplineKey } from './spline';
import { TRACK } from './track';

export interface PathPose {
  pos: Vec3;
  target: Vec3;
  fov: number;
  /** Distance to keep in focus (depth of field). */
  focus: number;
  /** Camera up vector for lookAt; world up when absent. */
  up?: Vec3;
}

export interface CameraPath {
  readonly duration: number;
  poseAt(t: number): PathPose;
}

/** The measured walk, then the dive, mosaic and network in the robot frame. */
export function buildGalleryPath(sequence: Sequence, gallery: Gallery): CameraPath {
  const track = gallery.track;
  const F = gallery.finale.frame;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const C = gallery.finale.lifted;
  const t0 = dive.start;
  const d = dive.end - dive.start;
  const m = mosaic.end - mosaic.start;
  // The orbit ends TRACK.robots.orbit round the platform; the dive keys swing back onto its axis (fraction f of the angle).
  const swing = ([x, y, z]: Vec3, f: number): Vec3 => {
    const a = f * TRACK.robots.orbit;
    return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
  };

  // Leave the walk with its own position and velocity: the dive keeps going forward (review I4).
  const exitTarget = track.target.at(t0);
  const targetVel = scale(sub(exitTarget, track.target.at(t0 - 1e-3)), 1e3);
  const posKeys: SplineKey[] = [
    { t: t0, value: toLocal(F, track.exit.pos), velocity: toLocalDir(F, track.exit.vel) },
    // In the dive frame the platform centre is the origin and the camera arrives from +z (original 150–162 s):
    // past the arm, a low glide over the carpet looking down at it, then up until it looks straight down.
    { t: t0 + 0.35 * d, value: swing([0.3, 1.35, 3.6], 0.5) },
    { t: t0 + 0.6 * d, value: [-0.1, 0.95, 1.2] },
    { t: t0 + 0.8 * d, value: [0, 2.4, 0.4] },
    { t: dive.end, value: [0, 4.8, 0.25] },
    // As in the original: by a third of the mosaic the whole lifted carpet is in frame, then it shrinks away.
    { t: mosaic.start + 0.35 * m, value: [C[0], C[1] + 11, C[2] + 7] },
    { t: mosaic.end, value: [C[0], C[1] + 8.5, C[2] + 5] },
  ];
  const targetKeys: SplineKey[] = [
    { t: t0, value: toLocal(F, exitTarget), velocity: toLocalDir(F, targetVel) },
    { t: t0 + 0.35 * d, value: swing([0.3, 0.4, -0.5], 0.5) },
    // From the glide on, the target keeps the camera's sideways offset: it faces straight along the dive, so the
    // up vector can turn towards the direction of travel without rolling the picture.
    { t: t0 + 0.6 * d, value: [-0.1, 0.36, -2.2] },
    { t: t0 + 0.8 * d, value: [0, 0.36, -0.6] },
    { t: dive.end, value: [0, 0.36, 0] },
    { t: mosaic.start + 0.35 * m, value: C },
    { t: mosaic.end, value: C },
  ];
  if (network) {
    const n = network.end - network.start;
    // Past the outer nodes to just outside the star shell (radius 11.5–12.5, review M2), then back until the whole sphere fills the frame.
    posKeys.push({ t: network.start + 0.4 * n, value: [C[0] + 3, C[1] + 12, C[2] + 7.5] }, { t: network.end, value: [C[0], C[1] + 22, C[2] + 15.5] });
    targetKeys.push({ t: network.start + 0.4 * n, value: C }, { t: network.end, value: C });
  }
  const pos = createSpline(posKeys);
  const target = createSpline(targetKeys);
  const walkFocus = track.focus.at(t0);
  const card = gallery.finale.card;
  const forward: Vec3 = [0, 0, -1];

  return {
    duration: sequence.total,
    poseAt(t) {
      if (t >= ending.start) {
        return { pos: toWorld(F, [card[0], card[1], card[2] + 6.2]), target: toWorld(F, [card[0], card[1] - 0.2, card[2]]), fov: 35, focus: 6.2 };
      }
      if (t < t0) return { pos: track.pos.at(t), target: track.target.at(t), fov: TRACK.fov, focus: Math.max(0.8, track.focus.at(t)) };
      const p = pos.at(t);
      const q = target.at(t);
      // Looking down, "up" in the picture follows the dive's direction of travel, so passing over the vertical
      // can never flip the picture (the original rolls steadily, at most ~2.4°/s).
      const v = sub(q, p);
      const k = smoothstep(0.55, 0.9, -v[1] / length(v));
      const up = add(scale([0, 1, 0], 1 - k), scale(forward, k));
      // Hand the focus over from the walk instead of snapping to the look distance (review I2).
      const focus = lerp(walkFocus, length(sub(p, q)), smoothstep(t0, t0 + 0.2 * d, t));
      return { pos: toWorld(F, p), target: toWorld(F, q), fov: TRACK.fov, focus: Math.max(0.8, focus), up: toWorldDir(F, scale(up, 1 / length(up))) };
    },
  };
}
