import type { ShotId, Storyboard, Vec3 } from '../types';
import { clamp } from '../util/math';

export const WALL = {
  distance: 7,
  speed: 1.5,
  yaw0: (28 * Math.PI) / 180,
  eye: 1.6,
  lookY: 1.9,
  height: 6,
  fov: 38,
} as const;

/** Box sizes of the wall texts (metres), used for placement and non-overlap. */
export const WALL_TEXT = {
  titleWidth: 6.4,
  titleHeight: 1.7,
  introTextWidth: 5.2,
  introHeight: 1.2,
  avatar: 0.9,
  exhibitionWidth: 10,
  exhibitionHeight: 3.2,
  gap: 0.8,
} as const;

export const WALL_SHOTS: readonly ShotId[] = ['title', 'intro', 'exhibition', 'portraits', 'photos'];

export interface WallRun {
  /** End time of the continuous wall shot. */
  end: number;
  /** Midpoint of the exhibition shot: the camera is parallel to the wall from here on. */
  exhibitionTime: number;
  /** Constant truck speed (m/s). */
  speed: number;
}

/** Title centre: 0.6 m right of where the camera looks at t = 0. */
export const titleX = (): number => WALL.distance * Math.tan(WALL.yaw0) + 0.6;

export function wallRunOf(storyboard: Storyboard): WallRun {
  if (storyboard.shots[0]?.id !== 'title') throw new Error('storyboard must open with the title shot');
  let end = 0;
  for (const s of storyboard.shots) {
    if (!WALL_SHOTS.includes(s.id)) break;
    end = s.end;
  }
  const exhibition = storyboard.shots.find((s) => s.id === 'exhibition');
  if (!exhibition) throw new Error('storyboard must include the exhibition shot');
  const exhibitionTime = (exhibition.start + exhibition.end) / 2;
  const hasIntro = storyboard.shots.some((s) => s.id === 'intro');
  const introBlock = WALL_TEXT.avatar + 0.2 + WALL_TEXT.introTextWidth;
  const required =
    WALL_TEXT.titleWidth / 2 + WALL_TEXT.gap + (hasIntro ? introBlock + WALL_TEXT.gap : 0) + WALL_TEXT.exhibitionWidth / 2;
  const speed = Math.max(WALL.speed, (titleX() + required) / exhibitionTime);
  return { end, exhibitionTime, speed };
}

export const cameraX = (run: WallRun, t: number): number => run.speed * t;

export function yawAt(run: WallRun, t: number): number {
  const u = clamp(t / run.exhibitionTime, 0, 1);
  return WALL.yaw0 * (1 - u) ** 3;
}

/** Where the view axis meets the wall. */
export const focusX = (run: WallRun, t: number): number => cameraX(run, t) + WALL.distance * Math.tan(yawAt(run, t));

export function wallPose(run: WallRun, t: number): { pos: Vec3; target: Vec3; fov: number } {
  const x = cameraX(run, t);
  const yaw = yawAt(run, t);
  return {
    pos: [x, WALL.eye, WALL.distance],
    target: [x + 10 * Math.sin(yaw), WALL.lookY, WALL.distance - 10 * Math.cos(yaw)],
    fov: WALL.fov,
  };
}
