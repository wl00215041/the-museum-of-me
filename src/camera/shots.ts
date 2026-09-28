import { shotIndexAt } from '../plan/storyboard';
import type { StageLayout } from '../stage/layout';
import { wallPose, wallRunOf, type WallRun } from '../stage/wall-run';
import type { ShotSpan, Storyboard, Vec3 } from '../types';
import { clamp, lerp, smoothstep } from '../util/math';
import { createCameraPath, type CameraPose, type Keyframe } from './hermite';

export interface ShotPose extends CameraPose {
  fov: number;
}

export interface ShotPath {
  readonly duration: number;
  poseAt(t: number): ShotPose;
}

type ShotFn = (t: number) => ShotPose;

const key = (t: number, pos: Vec3, target: Vec3): Keyframe => ({ t, pos, target, hold: false });

function keyed(keys: Keyframe[], fov: number): ShotFn {
  const path = createCameraPath(keys);
  return (t) => ({ ...path.poseAt(t), fov });
}

const arc = (angle: number, radius: number, y: number): Vec3 => [radius * Math.sin(angle), y, radius * Math.cos(angle)];

function shotFn(span: ShotSpan, layout: StageLayout, run: WallRun): ShotFn {
  const { start: s, end: e } = span;
  const d = e - s;
  const at = (u: number) => s + u * d;
  const local = (t: number) => clamp((t - s) / d, 0, 1);
  switch (span.id) {
    case 'title':
    case 'intro':
    case 'exhibition':
    case 'portraits':
    case 'photos':
      return (t) => wallPose(run, t);
    case 'moments': {
      const { cameraFrom, cameraTo } = layout.moments;
      const yaw = (10 * Math.PI) / 180;
      return (t) => {
        const x = lerp(cameraFrom, cameraTo, local(t));
        return { pos: [x, 1.6, 6.5], target: [x + 10 * Math.sin(yaw), 1.8, 6.5 - 10 * Math.cos(yaw)], fov: 40 };
      };
    }
    case 'words':
      return keyed([key(s, [-4, 1.7, 9], [-4, 2.5, 0]), key(at(0.55), [2, 1.7, 9], [2, 2.5, 0]), key(e, [0.5, 2.2, 4.2], [0.3, 2.9, 0])], 40);
    case 'likes':
      return keyed([key(s, arc(-0.7, 7.5, 1.9), [0, 1.9, 0]), key(at(0.5), arc(-0.21, 7.2, 2.1), [0, 2.0, 0]), key(e, arc(0.26, 7, 2.3), [0, 2.1, 0])], 40);
    case 'videos':
      return (t) => {
        const x = lerp(-2.5, 2.5, local(t));
        return { pos: [x, 1.7, 8.5], target: [x * 0.4, 2.3, 0], fov: 40 };
      };
    case 'robots': {
      const cut = at(0.6);
      const wide = keyed([key(s, [-9, 3.6, 10], [0, 0.9, 0]), key(at(0.3), [-2, 3.2, 11], [0, 0.9, 0]), key(cut, [6, 2.6, 8.5], [1, 0.8, 0])], 42);
      const low = keyed([key(cut, [-4.5, 1.0, 3.8], [-1.5, 0.35, 0]), key(e, [3.5, 0.75, 2.2], [5, 0.35, -1])], 42);
      return (t) => (t < cut ? wide(t) : low(t));
    }
    case 'mosaic':
      return (t) => {
        const u = smoothstep(0, 1, local(t));
        return { pos: [0.6 * (1 - u), 0.3 * (1 - u), lerp(2.4, 24, u * u)], target: [0.3 * (1 - u), 0, 0], fov: 42 };
      };
    case 'network':
      return keyed([key(s, [0.4, 0.2, 1.6], [0, 0, 0]), key(at(0.35), [1.5, 1.0, 6], [0, 0, 0]), key(at(0.7), [-3, 3, 16], [0, 0, 0]), key(e, [0, 4, 30], [0, 0, 0])], 45);
    case 'ending':
      return () => ({ pos: [0, 0, 6.2], target: [0, -0.2, 0], fov: 35 });
  }
}

export function buildShots(storyboard: Storyboard, layout: StageLayout): ShotPath {
  const run = wallRunOf(storyboard);
  const fns = storyboard.shots.map((span) => shotFn(span, layout, run));
  return {
    duration: storyboard.total,
    poseAt(t: number): ShotPose {
      const i = shotIndexAt(storyboard, t);
      const span = storyboard.shots[i];
      return fns[i](clamp(t, span.start, span.end));
    },
  };
}
