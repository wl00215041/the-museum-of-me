import { SEQUENCE_BASE, findSegment, requireSegment } from '../plan/sequence';
import { add, dirOf, dot, rightOf, scale, sub, toWorld, type Frame } from '../stage/frame';
import type { Segment, Sequence, Vec3 } from '../types';
import { lerp, smoothstep } from '../util/math';
import { curve, integral, type Curve, type CurveKey } from './curve';
import { createSpline, type Spline } from './spline';

const deg = (d: number): number => (d * Math.PI) / 180;
/** tan of half the horizontal field of view (16:9 frame, 38° vertical). */
export const HALF_HFOV_TAN = Math.tan(deg(19)) * (16 / 9);

/** Camera track measured on the original film (spec v4 §1). Metres, seconds, radians. */
export const TRACK = {
  speed: 0.95,
  fov: 38,
  yaw0: deg(18),
  look: 10,
  eye: 1.3,
  eyeRise: 0.18,
  d0: 8.5,
  dEx: 6.1,
  dFriends: 7.0,
  dPhotosStart: 8.7,
  dPhotosMid: 12.8,
  dPhotosEnd: 14.6,
  pullBackSpeed: 0.85,
  pullBackEase: 2,
  whiteBlock: { at: 0.16, width: 1.2, gap: 1.6 },
  darkPillar: { after: 1.0, gap: 1.6, width: 1.1 },
  dark: { wallZ: 5.2, eye: 1.5, dEnd: 7.2, speed: 1.2, wallEndPastCamera: 2.6 },
  words: {
    /** Distance to the LED wall by fraction of the segment (original 63–92 s, from the zoom track). */
    d: [[0, 10.9], [0.1, 10.5], [0.24, 9.0], [0.41, 7.4], [0.59, 6.4], [0.76, 4.7], [0.86, 3.6], [0.97, 2.8], [1, 2.7]],
    /** Sideways speed in m/s at the original pace, by fraction. */
    drift: [[0, 1.1], [0.1, 0.45], [0.24, 0.35], [0.3, 0.15], [0.76, 0.13], [0.86, 0.45], [1, 0.6]],
    ledWidth: 8,
    ledHeight: 3.6,
    ledY: 2.0,
    /** The LED wall's right end, past the camera x at the end of Words. */
    rightMargin: 1.1,
    recessMargin: 0.5,
    switches: [0.41, 0.55, 0.57, 0.79],
  },
  hall: {
    turn: deg(30),
    turnEnd: 0.1,
    r0: 8.7,
    r1: 6,
    /** The camera spirals in less than the walls' reference radius (original zoom over 95–112 s: ×1.33). */
    r1Camera: 8,
    orbit: deg(160),
    lookOffset: deg(30),
    videosWall: 11,
    videosHalfWidth: 6.5,
    gridTurn: deg(90),
    gridLength: 14.5,
    likesTurn: deg(120),
    likesLength: 16,
    orbitEndWithVideos: 0.4,
    orbitEndWithoutVideos: 0.8,
  },
  /** Truck along the Videos wall; it speeds up over the last seconds before the robot door (original 121–123 s). */
  truck: { videos: 0.4, ramp: 1.5, doorBoost: 0.45, doorRamp: 3 },
  /** Wide enough to cover the whole frame at 1.6 m, so the robot room can be swapped in behind it. */
  door: { gap: 1.6, width: 2.2 },
  /**
   * Robot room (original 125–157 s): creep in, then orbit the platform to the right while moving in and rising,
   * looking down at the carpet more and more. dStart/dEnd are distances to the platform centre.
   */
  robots: { dStart: 16, dEnd: 7.5, eye: 1.6, eyeBlend: 0.1, orbitFrom: 0.57, orbit: deg(40), rise: 2.6, creep: 0.1, lookFrom: 1.1, lookTo: 0.45, settle: 1.0 },
  sample: 0.25,
} as const;

export interface WalkPose {
  pos: Vec3;
  yaw: number;
  /** Distance to what the original keeps sharp: the wall ahead, the thumb, the platform. */
  focus: number;
  /** Explicit look target; otherwise TRACK.look metres ahead along the yaw, at eye height. */
  target?: Vec3;
}

export interface Wipe {
  name: 'white-block' | 'dark-pillar' | 'robot-door';
  mid: number;
  start: number;
  end: number;
}

export interface HallAnchors {
  thumb: Vec3;
  turnYaw: number;
  orbitEnd: number;
  likesWall: Frame;
  gridWall: Frame;
  videosWall: Frame;
}

export interface TrackAnchors {
  tPullBack: number;
  whiteBlock: { x0: number; x1: number; depth: number } | null;
  whiteWallEnd: number;
  dark: { wallZ: number; x0: number } | null;
  words: { center: Vec3; width: number; height: number; recess: [number, number] } | null;
  hall: HallAnchors | null;
  darkPillar: Vec3 | null;
  door: Frame;
  robots: Frame;
  /** Camera x (robot frame) once the sideways motion has died out. */
  settle: number;
  platformZ: number;
  /** Platform centre on the floor, in the robot frame. */
  platform: Vec3;
}

export interface Track {
  speed: number;
  tPar: number;
  tEx: number;
  /** The analytic walk, piecewise by room (unsmoothed). */
  pose(t: number): WalkPose;
  /** Smoothed camera position, look target and focus from 0 to the dive. */
  pos: Spline;
  target: Spline;
  focus: Curve;
  exit: { pos: Vec3; vel: Vec3 };
  anchors: TrackAnchors;
  wipes: Wipe[];
  ledSwitches: number[];
}

const at = (s: Segment, u: number): number => s.start + u * (s.end - s.start);
const pace = (s: Segment): number => SEQUENCE_BASE[s.id] / (s.end - s.start);

export interface WhiteWalk {
  tTitle: number;
  tPar: number;
  tEx: number;
  tIntro: number | null;
  tPullBack: number;
  photosStart: number;
  /** Left face of the white block the camera passes after the intro (null without Friends). */
  blockX0: number | null;
  yawAt(t: number): number;
  distanceAt(t: number): number;
  xAt(t: number): number;
}

/** The white-wall part of the walk (original 0–53 s), cheap enough for the speed fit. */
export function whiteWalk(sequence: Sequence, V: number): WhiteWalk {
  const title = requireSegment(sequence, 'title');
  const exhibition = requireSegment(sequence, 'exhibition');
  const intro = findSegment(sequence, 'intro');
  const portraits = findSegment(sequence, 'portraits');
  const photos = requireSegment(sequence, 'photos');
  const tPar = at(exhibition, 0.2);
  const tPullBack = portraits ? at(portraits, 0.56) : photos.start;
  const keys: CurveKey[] = [
    { t: 0, v: TRACK.d0, slope: 0 },
    { t: at(exhibition, 0.5), v: TRACK.dEx, slope: 0 },
    { t: tPullBack, v: TRACK.dFriends, slope: 0 },
  ];
  if (portraits) keys.push({ t: photos.start, v: TRACK.dPhotosStart });
  keys.push({ t: at(photos, 0.6), v: TRACK.dPhotosMid }, { t: photos.end, v: TRACK.dPhotosEnd, slope: 0 });
  const D = curve(keys);
  const pb = TRACK.pullBackSpeed;
  const tau = TRACK.pullBackEase;
  const xAt = (t: number): number => {
    if (t <= tPullBack) return V * t;
    const d = t - tPullBack;
    return V * tPullBack + V * (pb * d + (1 - pb) * tau * (1 - Math.exp(-d / tau)));
  };
  return {
    tTitle: at(title, 0.3),
    tPar,
    tEx: at(exhibition, 0.55),
    tIntro: intro ? at(intro, 0.5) : null,
    tPullBack,
    photosStart: photos.start,
    blockX0: portraits ? xAt(at(portraits, TRACK.whiteBlock.at)) - TRACK.whiteBlock.width / 2 : null,
    yawAt: (t) => TRACK.yaw0 * (1 - smoothstep(0, tPar, t)),
    distanceAt: (t) => D.at(t),
    xAt,
  };
}

export function computeTrack(sequence: Sequence, V: number): Track {
  const white = whiteWalk(sequence, V);
  const portraits = findSegment(sequence, 'portraits');
  const photos = requireSegment(sequence, 'photos');
  const moments = findSegment(sequence, 'moments');
  const words = findSegment(sequence, 'words');
  const likes = findSegment(sequence, 'likes');
  const videos = findSegment(sequence, 'videos');
  const robots = requireSegment(sequence, 'robots');
  const dive = requireSegment(sequence, 'dive');

  const regions: { start: number; end: number; pose: (t: number) => WalkPose }[] = [];
  const poseAt = (t: number): WalkPose => {
    for (const r of regions) if (t <= r.end) return r.pose(Math.max(t, r.start));
    const last = regions[regions.length - 1];
    return last.pose(last.end);
  };
  const velBefore = (t: number): Vec3 => scale(sub(poseAt(t).pos, poseAt(t - 1e-3).pos), 1e3);

  // White wall and the Photos pull-back (original 0–53 s).
  regions.push({
    start: 0,
    end: photos.end,
    pose: (t) => {
      const d = white.distanceAt(t);
      const yaw = white.yawAt(t);
      const y = t <= white.tPullBack ? TRACK.eye : TRACK.eye + TRACK.eyeRise * Math.max(0, d - TRACK.dFriends);
      return { pos: [white.xAt(t), y, d], yaw, focus: d / Math.cos(yaw) };
    },
  });
  const pe = poseAt(photos.end);
  const hasDark = !!(moments || words);
  // With dark rooms the white wall ends at the dark pillar (set below); without them it runs past the robot door.
  let whiteWallEnd = white.xAt(robots.start) + 20;

  // Location: hold, then move in on the shallow wall (original 53–63 s).
  if (moments) {
    const m = moments;
    const x0 = pe.pos[0];
    const v0 = velBefore(photos.end)[0];
    const x = integral((t) => lerp(v0, TRACK.dark.speed * V, smoothstep(m.start, at(m, 0.3), t)), m.start, m.end);
    const z = curve([
      { t: m.start, v: pe.pos[2], slope: 0 },
      { t: at(m, 0.4), v: pe.pos[2], slope: 0 },
      { t: m.end, v: TRACK.dark.wallZ + TRACK.dark.dEnd },
    ]);
    regions.push({
      start: m.start,
      end: m.end,
      pose: (t) => {
        const zz = z.at(t);
        // Focus moves from the white wall to the nearer Location wall behind the dark pillar.
        const focus = lerp(pe.focus, zz - TRACK.dark.wallZ, smoothstep(m.start, at(m, 0.2), t));
        return { pos: [x0 + x.at(t), lerp(pe.pos[1], TRACK.dark.eye, smoothstep(m.start, at(m, 0.4), t)), zz], yaw: 0, focus };
      },
    });
  }

  // Words: walk almost straight up to the LED wall in its recess (original 63–92 s).
  let wordsAnchor: TrackAnchors['words'] = null;
  let wordsPlan: { xEnd: number; zLed: number } | null = null;
  if (words) {
    const w = words;
    const W = TRACK.words;
    const s0 = poseAt(w.start);
    const v0 = velBefore(w.start)[0];
    const zLed = s0.pos[2] - W.d[0][1];
    const dist = curve(W.d.map(([u, v]) => ({ t: at(w, u), v })));
    const drift = curve(W.drift.map(([u, v], i) => ({ t: at(w, u), v: i === 0 ? v0 : v * pace(w) })));
    const x = integral((t) => drift.at(t), w.start, w.end);
    // Without the hall (60 s cut) the right turn happens here, before the robot door.
    const turn = likes ? 0 : TRACK.hall.turn;
    // Straight from the raised Photos camera (60 s cut) the eye comes down over at least 2 s.
    const eyeEnd = Math.max(at(w, 0.1), w.start + 2);
    regions.push({
      start: w.start,
      end: w.end,
      pose: (t) => {
        const d = dist.at(t);
        return {
          pos: [s0.pos[0] + x.at(t), lerp(s0.pos[1], TRACK.dark.eye, smoothstep(w.start, eyeEnd, t)), zLed + d],
          yaw: turn * smoothstep(Math.min(at(w, 0.95), w.end - 1.2), w.end, t),
          focus: lerp(s0.focus, d, smoothstep(w.start, at(w, 0.1), t)),
        };
      },
    });
    wordsPlan = { xEnd: s0.pos[0] + x.at(w.end), zLed };
  }

  // The dark pillar after Photos is the front end of the partition between the white wall and the dark rooms (original 53–55 s).
  let darkPillar: Vec3 | null = null;
  let tPillar = 0;
  const next = moments ?? words;
  if (next) {
    tPillar = next.start + TRACK.darkPillar.after / pace(next);
    const p = poseAt(tPillar);
    darkPillar = [p.pos[0], 0, p.pos[2] - TRACK.darkPillar.gap];
    whiteWallEnd = p.pos[0];
  }
  if (wordsPlan) {
    const W = TRACK.words;
    // Keep the recess clear of the partition when Words follows Photos directly (60 s cut).
    const cx = Math.max(wordsPlan.xEnd + W.rightMargin - W.ledWidth / 2, whiteWallEnd + TRACK.dark.wallEndPastCamera + W.recessMargin + W.ledWidth / 2);
    const right = cx + W.ledWidth / 2;
    wordsAnchor = { center: [cx, W.ledY, wordsPlan.zLed], width: W.ledWidth, height: W.ledHeight, recess: [cx - W.ledWidth / 2 - W.recessMargin, right + W.recessMargin] };
  }

  // The hall: turn right off the LED wall, orbit the thumb, truck along the Videos wall (original 92–122 s).
  let hall: HallAnchors | null = null;
  if (likes) {
    const l = likes;
    const H0 = TRACK.hall;
    const s0 = poseAt(l.start);
    const v0 = velBefore(l.start)[0];
    const tTurn = at(l, H0.turnEnd);
    const tOrbitEnd = videos ? at(videos, H0.orbitEndWithVideos) : at(l, H0.orbitEndWithoutVideos);
    // Focus moves from the LED wall to the hall over at least 2 s, carrying on into the orbit.
    const focusIn = (t: number) => smoothstep(l.start, l.start + Math.max(tTurn - l.start, 2), t);
    regions.push({
      start: l.start,
      end: tTurn,
      pose: (t) => {
        const k = smoothstep(l.start, tTurn, t);
        // Slow to a stop while turning, so the orbit starts from rest.
        const d = t - l.start;
        const x = v0 * (d - (d * d) / (2 * (tTurn - l.start)));
        return { pos: [s0.pos[0] + x, s0.pos[1], s0.pos[2]], yaw: H0.turn * k, focus: lerp(s0.focus, H0.r0 + 4, focusIn(t)) };
      },
    });
    const p1 = poseAt(tTurn).pos;
    const thumb = add([p1[0], 0, p1[2]], scale(dirOf(H0.turn), H0.r0));
    const orbit = (t: number): WalkPose => {
      const e = smoothstep(tTurn, tOrbitEnd, t);
      const phi = H0.turn - H0.orbit * e;
      const r = lerp(H0.r0, H0.r1Camera, e);
      const p = sub(thumb, scale(dirOf(phi), r));
      // Focus a little behind the thumb, so the walls around it stay readable.
      return { pos: [p[0], s0.pos[1], p[2]], yaw: phi + H0.lookOffset * e, focus: lerp(s0.focus, lerp(r + 4, H0.videosWall, e), focusIn(t)) };
    };
    regions.push({ start: tTurn, end: tOrbitEnd, pose: orbit });
    const last = orbit(tOrbitEnd);
    const vy = last.yaw;
    // Truck at the original pace of its segment, so it covers the same distance in every cut.
    const vT = TRACK.truck.videos * TRACK.speed * pace(videos ?? l);
    // At least 0.9 m/s past the door, even in long cuts, so the black does not linger.
    const boost = Math.max(TRACK.truck.doorBoost * TRACK.speed * pace(videos ?? l), 0.9 - vT);
    const truck = integral(
      (t) => vT * smoothstep(tOrbitEnd, tOrbitEnd + TRACK.truck.ramp, t) + boost * smoothstep(robots.start - TRACK.truck.doorRamp, robots.start, t),
      tOrbitEnd,
      robots.start,
    );
    regions.push({ start: tOrbitEnd, end: robots.start, pose: (t) => ({ pos: add(last.pos, scale(rightOf(vy), truck.at(t))), yaw: vy, focus: H0.videosWall }) });
    // Walls in a chain: Videos wall, the grid wall turned 50° at its right end, then the Likes wall.
    // The walls are laid out from the reference end point at r1, whatever the camera's own radius.
    const ref = sub(thumb, scale(dirOf(H0.turn - H0.orbit), H0.r1));
    const videosOrigin = add([ref[0], 0, ref[2]], scale(dirOf(vy), H0.videosWall));
    const videosRight = add(videosOrigin, scale(rightOf(vy), H0.videosHalfWidth));
    const gy = vy + H0.gridTurn;
    const gridFar = add(videosRight, scale(rightOf(gy), H0.gridLength));
    const ly = vy + H0.likesTurn;
    hall = {
      thumb,
      turnYaw: H0.turn,
      orbitEnd: tOrbitEnd,
      videosWall: { origin: videosOrigin, yaw: vy },
      gridWall: { origin: add(videosRight, scale(rightOf(gy), H0.gridLength / 2)), yaw: gy },
      likesWall: { origin: add(gridFar, scale(rightOf(ly), H0.likesLength / 2)), yaw: ly },
    };
  }

  // Robot room: slide past the door, settle and creep in, then orbit the platform (original 122–157 s).
  const t0 = robots.start;
  const r0 = poseAt(t0);
  const v0 = velBefore(t0);
  const yawR = r0.yaw;
  const R = TRACK.robots;
  const robotsFrame: Frame = { origin: [r0.pos[0], 0, r0.pos[2]], yaw: yawR };
  const vLat = dot(v0, rightOf(yawR));
  const vFwd = dot(v0, dirOf(yawR));
  const tau = R.settle;
  // Keep sliding at the door speed until the door has left the frame, then settle (original 123–127 s).
  const clear = TRACK.door.width / 2 + TRACK.door.gap * HALF_HFOV_TAN + 0.2;
  const tClear = clear / Math.max(Math.abs(vLat), 0.2);
  const slide = (d: number) => (d <= tClear ? d : tClear + tau * (1 - Math.exp(-(d - tClear) / tau)));
  const slideV = (d: number) => (d <= tClear ? 1 : Math.exp(-(d - tClear) / tau));
  const creep = R.creep * TRACK.speed * pace(robots);
  const eyeEnd = Math.max(at(robots, R.eyeBlend), t0 + 2);
  const tO = at(robots, R.orbitFrom);
  const T = dive.start - tO;
  const localA = (t: number): Vec3 => [
    vLat * slide(t - t0),
    lerp(r0.pos[1], R.eye, smoothstep(t0, eyeEnd, t)),
    -vFwd * tau * (1 - Math.exp(-(t - t0) / tau)) - creep * (t - t0),
  ];
  const atO = localA(tO);
  // The platform stands straight ahead of the camera, dStart away, when the orbit begins.
  const platform: Vec3 = [atO[0], 0, atO[2] - R.dStart];
  const platformZ = platform[2];
  const vxO = vLat * slideV(tO - t0);
  const vzO = -vFwd * Math.exp(-(tO - t0) / tau) - creep;
  const dist = curve([{ t: tO, v: R.dStart, slope: vzO }, { t: dive.start, v: R.dEnd, slope: (-1.8 * (R.dStart - R.dEnd)) / T }]);
  const phi = curve([{ t: tO, v: 0, slope: vxO / R.dStart }, { t: dive.start, v: R.orbit, slope: (1.6 * R.orbit) / T }]);
  const rise = curve([{ t: tO, v: R.eye, slope: 0 }, { t: dive.start, v: R.rise, slope: 0 }]);
  const lookAt = (y: number): Vec3 => toWorld(robotsFrame, [platform[0], y, platform[2]]);
  regions.push({
    start: t0,
    end: tO,
    pose: (t) => {
      const local = localA(t);
      const pos = toWorld(robotsFrame, local);
      const ahead = add(pos, scale(dirOf(yawR), TRACK.look));
      const k = smoothstep(Math.max(eyeEnd, tO - 3), tO, t);
      const target: Vec3 = [lerp(ahead[0], lookAt(R.lookFrom)[0], k), lerp(ahead[1], R.lookFrom, k), lerp(ahead[2], lookAt(R.lookFrom)[2], k)];
      return { pos, yaw: yawR, target, focus: lerp(r0.focus, local[2] - platformZ, smoothstep(t0, eyeEnd, t)) };
    },
  });
  regions.push({
    start: tO,
    end: dive.start,
    pose: (t) => {
      const d = dist.at(t);
      const a = phi.at(t);
      const pos = toWorld(robotsFrame, [platform[0] + d * Math.sin(a), rise.at(t), platform[2] + d * Math.cos(a)]);
      const target = lookAt(lerp(R.lookFrom, R.lookTo, smoothstep(tO, dive.start, t)));
      return { pos, yaw: yawR - a, target, focus: d };
    },
  });

  // Wipes: what crosses the lens, and for how long the frame is (partly) covered.
  const wipes: Wipe[] = [];
  const addWipe = (name: Wipe['name'], mid: number, halfWidth: number, gap: number, speed: number) => {
    const half = (halfWidth + gap * HALF_HFOV_TAN) / Math.max(Math.abs(speed), 0.2) + 0.3;
    wipes.push({ name, mid, start: mid - half, end: mid + half });
  };
  let whiteBlock: TrackAnchors['whiteBlock'] = null;
  if (portraits && white.blockX0 !== null) {
    const tb = at(portraits, TRACK.whiteBlock.at);
    whiteBlock = { x0: white.blockX0, x1: white.blockX0 + TRACK.whiteBlock.width, depth: white.distanceAt(tb) - TRACK.whiteBlock.gap };
    addWipe('white-block', tb, TRACK.whiteBlock.width / 2, TRACK.whiteBlock.gap, V);
  }
  if (darkPillar) addWipe('dark-pillar', tPillar, TRACK.darkPillar.width / 2, TRACK.darkPillar.gap, velBefore(tPillar)[0]);
  addWipe('robot-door', t0, TRACK.door.width / 2, TRACK.door.gap, vLat);
  // The door is removed only once it has slid out of the frame.
  wipes[wipes.length - 1].end = t0 + tClear + 0.3;

  // Smooth the piecewise walk: samples every 0.25 s plus every region edge, with their exact derivatives.
  const special = [white.tPar, white.tEx, white.tPullBack, dive.start, ...regions.flatMap((r) => [r.start, r.end])];
  const samples: number[] = [];
  for (let t = 0; t < dive.start; t += TRACK.sample) if (special.every((s) => Math.abs(s - t) > TRACK.sample / 2)) samples.push(t);
  const ts = [...new Set([...samples, ...special])].filter((t) => t >= 0 && t <= dive.start).sort((a, b) => a - b);
  // Key slopes: the mean of second-order one-sided differences, each exact on its own side of a region edge.
  const h = 1e-4;
  const around = (f: (t: number) => Vec3, t: number): Vec3 => {
    const sides: Vec3[] = [];
    const c = f(t);
    if (t - 2 * h >= 0) sides.push(scale(add(sub(scale(c, 3), scale(f(t - h), 4)), f(t - 2 * h)), 1 / (2 * h)));
    if (t + 2 * h <= dive.start) sides.push(scale(sub(sub(scale(f(t + h), 4), scale(c, 3)), f(t + 2 * h)), 1 / (2 * h)));
    return sides.length === 2 ? scale(add(sides[0], sides[1]), 0.5) : sides[0];
  };
  const posOf = (t: number): Vec3 => poseAt(t).pos;
  const targetOf = (t: number): Vec3 => {
    const p = poseAt(t);
    return p.target ?? add(p.pos, scale(dirOf(p.yaw), TRACK.look));
  };
  const pos = createSpline(ts.map((t) => ({ t, value: posOf(t), velocity: around(posOf, t) })));
  const target = createSpline(ts.map((t) => ({ t, value: targetOf(t), velocity: around(targetOf, t) })));
  const focus = curve(ts.map((t) => ({ t, v: poseAt(t).focus })));
  const exitPos = pos.at(dive.start);

  return {
    speed: V,
    tPar: white.tPar,
    tEx: white.tEx,
    pose: poseAt,
    pos,
    target,
    focus,
    exit: { pos: exitPos, vel: scale(sub(exitPos, pos.at(dive.start - 1e-3)), 1e3) },
    anchors: {
      tPullBack: white.tPullBack,
      whiteBlock,
      whiteWallEnd,
      dark: hasDark ? { wallZ: TRACK.dark.wallZ, x0: whiteWallEnd } : null,
      words: wordsAnchor,
      hall,
      darkPillar,
      door: { origin: add([r0.pos[0], 0, r0.pos[2]], scale(dirOf(yawR), TRACK.door.gap)), yaw: yawR },
      robots: robotsFrame,
      settle: platform[0],
      platformZ,
      platform,
    },
    wipes,
    ledSwitches: words ? TRACK.words.switches.map((u) => at(words, u)) : [],
  };
}
