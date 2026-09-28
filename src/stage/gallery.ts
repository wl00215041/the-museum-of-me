import { TRACK, computeTrack, whiteWalk, type Track, type WhiteWalk } from '../camera/track';
import { findSegment, requireSegment } from '../plan/sequence';
import type { Segment, Sequence, Vec3 } from '../types';
import { clamp, lerp } from '../util/math';
import { mulberry32 } from '../util/rng';
import { IDENTITY, child, toLocal, toWorld, type Frame } from './frame';
import { MAX_WALL_PHOTOS, networkLayout, photoSwarm, pickSpread, shuffle, spot, type CanvasItem, type NetworkLayout, type VisitorSpot } from './placement';

/** White-wall lettering, sized for the measured distances (spec v4 §1; tuned in Task 11). */
export const TEXT = {
  titleWidth: 4.2, titleHeight: 1.2, titleY: 1.5,
  exhibitionWidth: 5.6, exhibitionHeight: 1.9, exhibitionY: 1.55,
  introTextWidth: 5.4, introHeight: 1.1, introY: 1.6, avatar: 0.62,
  gap: 0.8, endMargin: 1,
} as const;
export const WALL_HEIGHT = { white: 7, dark: 6, robots: 10 } as const;
export const LABEL_Y = 1.75;
export const CARPET = { cols: 64, rows: 36, pitch: 0.15, tile: 0.14 } as const;
export const ROBOTS = { platform: { width: 10, depth: 6, height: 0.35 }, back: 8, halfWidth: 16, front: 6, liftY: 3, floaters: 260, large: 7, armScale: 1.4 } as const;
export const HALL = {
  /** Low, wide dark disc under the like sculpture (original 95 s). */
  pedestal: { radius: 2.3, height: 0.22 },
  crt: { count: 7, from: -3.5, pitch: 1.1, y: 1.35, z: 1.6, width: 0.6, height: 0.45 },
  /** The photo grid hangs on the grid wall's west part, next to the Videos corner. */
  grid: { cols: 6, rows: 5, pitchX: 1.1, pitchY: 0.8, width: 1.0, height: 0.72, bottom: 1.0, step: 1.6, offset: -2.4 },
  videos: { cols: 4, rows: 3, width: 2, height: 1.2, gap: 0.06, y: 2.2 },
} as const;

export type Region = 'walk' | 'robots' | 'both';

/** A wall in its frame's local xy plane (z = 0), facing local +z. */
export interface WallQuad {
  name: string;
  frame: Frame;
  center: [number, number];
  width: number;
  height: number;
  dark: boolean;
  region: Region;
}

export interface FloorQuad {
  name: string;
  frame: Frame;
  center: [number, number];
  width: number;
  depth: number;
  dark: boolean;
  region: Region;
}

export interface Block {
  name: string;
  frame: Frame;
  center: Vec3;
  size: Vec3;
  dark: boolean;
  region: Region;
  /** Removed from the scene after this time (the robot door, once it has left the frame). */
  until?: number;
}

export interface Obstacle {
  name: string;
  frame: Frame;
  min: Vec3;
  max: Vec3;
  region: Region;
  until?: number;
}

export interface Label {
  text: string;
  number: string;
  frame: Frame;
  at: Vec3;
  dark: boolean;
}

export interface WallText {
  center: Vec3;
  width: number;
  height: number;
}

export interface Screen {
  center: Vec3;
  width: number;
  height: number;
  bars: boolean;
  photoIndex: number;
}

export interface GridCell {
  col: number;
  row: number;
  center: Vec3;
  width: number;
  height: number;
  /** Photo shown during swap step k. */
  photos: number[];
}

export interface Gallery {
  speed: number;
  track: Track;
  walls: WallQuad[];
  floors: FloorQuad[];
  blocks: Block[];
  obstacles: Obstacle[];
  labels: Label[];
  wall: {
    title: WallText;
    exhibition: WallText;
    intro: (WallText & { avatar: CanvasItem }) | null;
    blockText: { frame: Frame; center: Vec3; width: number; height: number } | null;
  };
  portraits: { items: CanvasItem[]; visitors: VisitorSpot[] } | null;
  photos: { items: CanvasItem[]; visitors: VisitorSpot[] };
  /** In the Location frame { origin: [0, 0, wallZ], yaw: 0 }. */
  location: { frame: Frame; boxes: CanvasItem[]; visitors: VisitorSpot[] } | null;
  words: { wall: WallText; visitors: VisitorSpot[] } | null;
  hall: {
    thumb: Frame;
    crts: { frame: Frame; screens: Screen[] };
    grid: { frame: Frame; cells: GridCell[]; step: number; start: number };
    videos: { frame: Frame; photoIndex: number; panels: { col: number; row: number; center: Vec3; width: number; height: number }[]; visitors: VisitorSpot[] };
    visitors: VisitorSpot[];
  } | null;
  robots: {
    frame: Frame;
    platform: { center: Vec3; width: number; depth: number; height: number };
    arms: { pos: Vec3; yaw: number; phase: number }[];
    floaters: { photoIndex: number; pos: Vec3; size: number; phase: number }[];
  };
  /**
   * In the dive frame: centred on the platform, facing the camera where the orbit ends. `carpetYaw` turns the carpet
   * back into line with the platform; it untwists as the carpet lifts into the mosaic.
   */
  finale: { frame: Frame; carpet: Vec3; lifted: Vec3; network: NetworkLayout; card: Vec3; carpetYaw: number };
  featured: number[];
  portraitIndex: number;
}

export interface GalleryInput {
  sequence: Sequence;
  aspects: number[];
  portraitIndex: number;
  seed: number;
}

type WallTexts = Omit<Gallery['wall'], 'blockText'>;

function wallTexts(white: WhiteWalk): { wall: WallTexts; fits: boolean } {
  const focusX = (t: number) => white.xAt(t) + white.distanceAt(t) * Math.tan(white.yawAt(t));
  const title: WallText = { center: [focusX(white.tTitle) + 0.4, TEXT.titleY, 0], width: TEXT.titleWidth, height: TEXT.titleHeight };
  const exX = white.xAt(white.tEx);
  const exhibition: WallText = { center: [exX, TEXT.exhibitionY, 0], width: TEXT.exhibitionWidth, height: TEXT.exhibitionHeight };
  const exRight = exX + TEXT.exhibitionWidth / 2;
  // The intro ends before the white block; without Friends, the texts end before the Photos label.
  const limit = white.blockX0 ?? white.xAt(white.photosStart) + 1.5;
  let intro: WallTexts['intro'] = null;
  let lastRight = exRight;
  if (white.tIntro !== null) {
    const blockW = TEXT.avatar + 0.2 + TEXT.introTextWidth;
    const latest = limit - TEXT.endMargin - blockW / 2;
    const c = Math.max(Math.min(white.xAt(white.tIntro), latest), exRight + TEXT.gap + blockW / 2);
    const left = c - blockW / 2;
    intro = {
      center: [left + TEXT.avatar + 0.2 + TEXT.introTextWidth / 2, TEXT.introY, 0],
      width: TEXT.introTextWidth,
      height: TEXT.introHeight,
      avatar: { photoIndex: -1, center: [left + TEXT.avatar / 2, TEXT.introY, 0], width: TEXT.avatar, height: TEXT.avatar },
    };
    lastRight = left + blockW;
  }
  const fits = title.center[0] + TEXT.titleWidth / 2 + TEXT.gap <= exhibition.center[0] - TEXT.exhibitionWidth / 2 && lastRight + TEXT.endMargin <= limit;
  return { wall: { title, exhibition, intro }, fits };
}

/** The slowest speed (from the measured 0.95 m/s up) at which the white-wall texts fit. */
export function gallerySpeed(sequence: Sequence): number {
  let V: number = TRACK.speed;
  for (let i = 0; i < 200; i++) {
    if (wallTexts(whiteWalk(sequence, V)).fits) return V;
    V *= 1.02;
  }
  throw new Error('the white-wall texts do not fit at any walking speed');
}

const at = (s: Segment, u: number) => s.start + u * (s.end - s.start);

export function computeGallery(input: GalleryInput): Gallery {
  const { sequence, aspects } = input;
  const n = aspects.length;
  if (n === 0) throw new Error('the gallery needs at least one photo');
  const portraitIndex = clamp(Math.round(input.portraitIndex), 0, n - 1);
  const rnd = mulberry32(input.seed);
  const V = gallerySpeed(sequence);
  const white = whiteWalk(sequence, V);
  const track = computeTrack(sequence, V);
  const A = track.anchors;
  const texts = wallTexts(white).wall;
  if (texts.intro) texts.intro.avatar.photoIndex = portraitIndex;
  const photosSeg = requireSegment(sequence, 'photos');
  const portraitsSeg = findSegment(sequence, 'portraits');
  const moments = findSegment(sequence, 'moments');
  const words = findSegment(sequence, 'words');
  const likes = findSegment(sequence, 'likes');
  const robotsSeg = requireSegment(sequence, 'robots');
  const xAt = (t: number) => track.pose(t).pos[0];

  const walls: WallQuad[] = [];
  const floors: FloorQuad[] = [];
  const blocks: Block[] = [];
  const obstacles: Obstacle[] = [];
  const labels: Label[] = [];
  let section = 0;

  // White wall (z = 0) and its floor.
  const wallEnd = A.whiteWallEnd;
  walls.push({ name: 'white-wall', frame: IDENTITY, center: [(wallEnd - 12) / 2, WALL_HEIGHT.white / 2], width: wallEnd + 12, height: WALL_HEIGHT.white, dark: false, region: 'walk' });
  floors.push({ name: 'white-floor', frame: IDENTITY, center: [(wallEnd - 15) / 2, 10], width: wallEnd + 15, depth: 20, dark: false, region: 'walk' });

  let blockText: Gallery['wall']['blockText'] = null;
  if (A.whiteBlock) {
    const b = A.whiteBlock;
    blocks.push({ name: 'white-block', frame: IDENTITY, center: [(b.x0 + b.x1) / 2, WALL_HEIGHT.white / 2, b.depth / 2], size: [b.x1 - b.x0, WALL_HEIGHT.white, b.depth], dark: false, region: 'walk' });
    // A column of text on the block's side facing the Friends room (original 26 s).
    blockText = { frame: { origin: [b.x1 + 0.005, 0, 0], yaw: -Math.PI / 2 }, center: [-b.depth * 0.55, 1.45, 0], width: 1.5, height: 1.3 };
  }

  let portraits: Gallery['portraits'] = null;
  const photosLabelX = xAt(photosSeg.start) + 1.7;
  if (portraitsSeg && A.whiteBlock) {
    const labelX = A.whiteBlock.x1 + 2.0;
    labels.push({ text: 'Friends', number: String(++section), frame: IDENTITY, at: [labelX, LABEL_Y, 0.01], dark: false });
    const xa = labelX + 1.6;
    const xb = photosLabelX - 1.4;
    const k = Math.min(12, n, Math.max(1, Math.floor((xb - xa) / 1.7) + 1));
    const indices = pickSpread(n, k);
    portraits = {
      items: indices.map((photoIndex, i) => ({ photoIndex, center: [k === 1 ? (xa + xb) / 2 : lerp(xa, xb, i / (k - 1)), 2.03, 0], width: 1.15, height: 1.15 })),
      // One visitor stands close to the lens, cut by the frame (original 32–34 s); one at the wall.
      visitors: [spot([xAt(at(portraitsSeg, 0.62)) + 0.8, 0, 4.4], 0, rnd), spot([xAt(at(portraitsSeg, 0.8)) + 1.8, 0, 1.0], 1, rnd)],
    };
  }

  labels.push({ text: 'Photos', number: String(++section), frame: IDENTITY, at: [photosLabelX, LABEL_Y, 0.01], dark: false });
  const swarmA = photosLabelX + 1.2;
  const swarmB = Math.max(swarmA + 4, wallEnd - 0.8);
  const passer = track.pose(at(photosSeg, 0.55)).pos;
  const wallPhotos = n <= MAX_WALL_PHOTOS ? Array.from({ length: n }, (_, i) => i) : pickSpread(n, MAX_WALL_PHOTOS);
  const photos: Gallery['photos'] = {
    // Photos grow along the wall so they stay legible while the camera pulls back (user feedback, v4).
    items: wallPhotos.length === n
      ? photoSwarm(aspects, swarmA, swarmB, rnd, WALL_HEIGHT.white, 0, [1.5, 5.3], [0.8, 2.2])
      : photoSwarm(wallPhotos.map((i) => aspects[i]), swarmA, swarmB, rnd, WALL_HEIGHT.white, 0, [1.5, 5.3], [0.8, 2.2]).map((item) => ({ ...item, photoIndex: wallPhotos[item.photoIndex] })),
    visitors: [
      spot([lerp(swarmA, swarmB, 0.25), 0, 1.2], 0, rnd),
      spot([lerp(swarmA, swarmB, 0.55), 0, 1.6], 2, rnd),
      spot([lerp(swarmA, swarmB, 0.8), 0, 2.4], 1, rnd),
      // Passes right in front of the lens during the pull-back (original 46 s).
      spot([passer[0] - 0.5, 0, passer[2] - 1.4], 0, rnd),
    ],
  };

  // Dark rooms: the shallow Location wall and the Words recess (original 53–92 s).
  let location: Gallery['location'] = null;
  let wordsRoom: Gallery['words'] = null;
  if (A.dark) {
    const D = A.dark;
    const recess = A.words?.recess ?? ([D.x0 + 14, D.x0 + 14] as [number, number]);
    const front: Frame = { origin: [0, 0, D.wallZ], yaw: 0 };
    // The partition between Photos and the dark rooms runs from the white wall to the dark pillar: white on the Photos side, dark beyond (original 51–56 s).
    const half = 0.25;
    const front0 = A.darkPillar ? A.darkPillar[2] - half : D.wallZ;
    walls.push({ name: 'white-end', frame: { origin: [D.x0 - half, 0, 0], yaw: Math.PI / 2 }, center: [front0 / 2, WALL_HEIGHT.white / 2], width: front0, height: WALL_HEIGHT.white, dark: false, region: 'walk' });
    if (front0 > D.wallZ) walls.push({ name: 'dark-side', frame: { origin: [D.x0 + half, 0, D.wallZ], yaw: -Math.PI / 2 }, center: [-(front0 - D.wallZ) / 2, WALL_HEIGHT.dark / 2], width: front0 - D.wallZ, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    walls.push({ name: 'location-wall', frame: front, center: [(D.x0 + half + recess[0]) / 2, WALL_HEIGHT.dark / 2], width: recess[0] - D.x0 - half, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    floors.push({ name: 'dark-floor', frame: IDENTITY, center: [D.x0 + 60, -20], width: 120, depth: 80, dark: true, region: 'walk' });
    if (moments) {
      labels.push({ text: 'Location', number: String(++section), frame: front, at: [D.x0 + 1.5, LABEL_Y, 0.01], dark: true });
      const indices = n >= 3 ? pickSpread(n, 3, 0.37) : [0, 1, 2].map((i) => i % n);
      const lo = D.x0 + 2.2;
      const hi = recess[0] - 1.6;
      const spacing = Math.min(2.6, Math.max(0, (hi - lo) / 2));
      const mid = clamp(xAt(at(moments, 0.7)) + 0.25, lo + spacing, Math.max(lo + spacing, hi - spacing));
      const cx = xAt(at(moments, 0.7));
      location = {
        frame: front,
        boxes: indices.map((photoIndex, i) => ({ photoIndex, center: [mid + (i - 1) * spacing, 1.65, 0], width: 1.5, height: 2.5 })),
        visitors: [spot([cx - 1.2, 0, 1.3], 2, rnd, true), spot([cx + 3.6, 0, 1.6], 0, rnd, true)],
      };
    }
    if (words && A.words) {
      const W = A.words;
      const zLed = W.center[2];
      labels.push({ text: 'Words', number: String(++section), frame: front, at: [recess[0] - 1.2, LABEL_Y, 0.01], dark: true });
      walls.push({ name: 'recess-left', frame: { origin: [recess[0], 0, D.wallZ], yaw: -Math.PI / 2 }, center: [(D.wallZ - zLed) / 2, WALL_HEIGHT.dark / 2], width: D.wallZ - zLed, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
      walls.push({ name: 'led-back', frame: { origin: [0, 0, zLed], yaw: 0 }, center: [(recess[0] + recess[1]) / 2, WALL_HEIGHT.dark / 2], width: recess[1] - recess[0], height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
      if (!likes) walls.push({ name: 'recess-right', frame: { origin: [recess[1], 0, zLed], yaw: Math.PI / 2 }, center: [(D.wallZ - zLed) / 2, WALL_HEIGHT.dark / 2], width: D.wallZ - zLed, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
      wordsRoom = {
        wall: { center: [W.center[0], W.center[1], zLed + 0.02], width: W.width, height: W.height },
        visitors: [spot([W.center[0] - 2.5, 0, zLed + 1.8], 0, rnd, true), spot([W.center[0] + 1.5, 0, zLed + 2.2], 1, rnd, true)],
      };
    }
  }
  if (A.darkPillar) {
    blocks.push({ name: 'dark-pillar', frame: IDENTITY, center: [A.darkPillar[0], 5, A.darkPillar[2]], size: [TRACK.darkPillar.width, 10, 0.5], dark: true, region: 'walk' });
  }

  // The hall: Likes 5.1, Photos 5.2 and Videos 5.3 around the thumb (original 92–122 s).
  let hall: Gallery['hall'] = null;
  if (likes && A.hall) {
    const Hh = A.hall;
    const no = ++section;
    const H = TRACK.hall;
    const thumb: Frame = { origin: Hh.thumb, yaw: Hh.turnYaw };
    const pr = HALL.pedestal.radius + 0.1;
    obstacles.push({ name: 'sculpture', frame: thumb, min: [-pr, 0, -pr], max: [pr, 3.2, pr], region: 'walk' });
    walls.push({ name: 'likes-wall', frame: Hh.likesWall, center: [0, WALL_HEIGHT.dark / 2], width: H.likesLength, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    walls.push({ name: 'grid-wall', frame: Hh.gridWall, center: [0, WALL_HEIGHT.dark / 2], width: H.gridLength, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    walls.push({ name: 'videos-wall', frame: Hh.videosWall, center: [0, WALL_HEIGHT.dark / 2], width: 2 * H.videosHalfWidth, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });

    const C = HALL.crt;
    const screens: Screen[] = Array.from({ length: C.count }, (_, i) => ({ center: [C.from + i * C.pitch, C.y, C.z], width: C.width, height: C.height, bars: i % 3 === 1, photoIndex: (i * 5 + 2) % n }));
    obstacles.push({ name: 'crt-row', frame: Hh.likesWall, min: [C.from - 0.5, 0, C.z - 0.4], max: [C.from + (C.count - 1) * C.pitch + 0.5, 1.9, C.z + 0.4], region: 'walk' });
    labels.push({ text: 'Likes', number: `${no}.1`, frame: Hh.likesWall, at: [C.from + C.count * C.pitch + 0.6, LABEL_Y, 0.01], dark: true });

    const G = HALL.grid;
    const steps = Math.ceil((robotsSeg.start - likes.start) / G.step) + 1;
    const pool = shuffle(n, rnd);
    const cells: GridCell[] = [];
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        cells.push({ col: c, row: r, center: [G.offset + (c - (G.cols - 1) / 2) * G.pitchX, G.bottom + (G.rows - 1 - r) * G.pitchY, 0.02], width: G.width, height: G.height, photos: [pool[(r * G.cols + c) % n]] });
      }
    }
    let next = cells.length;
    for (let k = 1; k < steps; k++) {
      // One or two photos change at each step, as on the original's grid wall.
      const changed = new Set([(k * 7 + 3) % cells.length, ...(k % 2 === 0 ? [(k * 11 + 5) % cells.length] : [])]);
      cells.forEach((cell, i) => cell.photos.push(changed.has(i) ? pool[next++ % n] : cell.photos[k - 1]));
    }
    labels.push({ text: 'Photos', number: `${no}.2`, frame: Hh.gridWall, at: [G.offset + (G.cols * G.pitchX) / 2 + 0.7, LABEL_Y, 0.01], dark: true });

    const Vd = HALL.videos;
    const panels: NonNullable<Gallery['hall']>['videos']['panels'] = [];
    for (let row = 0; row < Vd.rows; row++) {
      for (let col = 0; col < Vd.cols; col++) {
        panels.push({ col, row, center: [(col - (Vd.cols - 1) / 2) * (Vd.width + Vd.gap), Vd.y + ((Vd.rows - 1) / 2 - row) * (Vd.height + Vd.gap), 0.02], width: Vd.width, height: Vd.height });
      }
    }
    labels.push({ text: 'Videos', number: `${no}.3`, frame: Hh.videosWall, at: [H.videosHalfWidth - 0.45, LABEL_Y, 0.01], dark: true });
    hall = {
      thumb,
      crts: { frame: Hh.likesWall, screens },
      grid: { frame: Hh.gridWall, cells, step: G.step, start: likes.start },
      videos: { frame: Hh.videosWall, photoIndex: pickSpread(n, 1, 0.61)[0], panels, visitors: [spot([-1.2, 0, 1.8], 0, rnd, true), spot([0.3, 0, 1.6], 2, rnd, true)] },
      visitors: [spot(toWorld(thumb, [-1.5, 0, 2.6]), 1, rnd, true, Math.PI - Hh.turnYaw)],
    };
  }

  // Robot room and finale, in the robot frame (straight ahead of the camera at the swap).
  const F2 = A.robots;
  const P = ROBOTS.platform;
  const px = A.settle;
  const pz = A.platformZ;
  const zBack = pz - ROBOTS.back;
  const depth = ROBOTS.front - zBack;
  walls.push({ name: 'robots-back', frame: child(F2, [0, 0, zBack]), center: [px, WALL_HEIGHT.robots / 2], width: 2 * ROBOTS.halfWidth, height: WALL_HEIGHT.robots, dark: false, region: 'robots' });
  walls.push({ name: 'robots-left', frame: child(F2, [px - ROBOTS.halfWidth, 0, zBack], -Math.PI / 2), center: [-depth / 2, WALL_HEIGHT.robots / 2], width: depth, height: WALL_HEIGHT.robots, dark: false, region: 'robots' });
  walls.push({ name: 'robots-right', frame: child(F2, [px + ROBOTS.halfWidth, 0, zBack], Math.PI / 2), center: [depth / 2, WALL_HEIGHT.robots / 2], width: depth, height: WALL_HEIGHT.robots, dark: false, region: 'robots' });
  floors.push({ name: 'robots-floor', frame: F2, center: [px, (zBack + ROBOTS.front) / 2], width: 2 * ROBOTS.halfWidth, depth, dark: false, region: 'robots' });
  const door = track.wipes.find((w) => w.name === 'robot-door')!;
  blocks.push({ name: 'robot-door', frame: A.door, center: [0, 5, 0], size: [TRACK.door.width, 10, 0.4], dark: true, region: 'both', until: door.end });

  const platformCenter: Vec3 = [px, P.height / 2, pz];
  // The last arm stands left of the dive so the camera brushes past it (original 152 s).
  // The dive runs in its own frame, centred on the platform and facing the camera where the orbit ends.
  const diveFrame = child(F2, [px, 0, pz], -TRACK.robots.orbit);
  const inRobots = (dx: number, dz: number): [number, number] => {
    const p = toLocal(F2, toWorld(diveFrame, [dx, 0, dz]));
    return [p[0] - px, p[2] - pz];
  };
  // Four arms around the platform; the last stands left of the dive so the camera brushes past it (original 152 s).
  const armSpots: [number, number, number][] = [[-6.2, 0.6, 0], [6.2, 0.2, 1.7], [-3.6, -4.2, 3.1], [3.6, -4.0, 4.6], [...inRobots(-3.4, 4.8), 2.3]];
  const arms = armSpots.map(([dx, dz, phase]) => ({ pos: [px + dx, 0, pz + dz] as Vec3, yaw: Math.atan2(-dx, -dz), phase }));
  for (const arm of arms) {
    const k = ROBOTS.armScale;
    // A box in the arm's own frame: local +z is the direction it reaches in (towards the platform).
    obstacles.push({ name: 'arm', frame: child(F2, arm.pos, -arm.yaw), min: [-0.7 * k, 0, -0.7 * k], max: [0.7 * k, 3.1 * k, (2.4 + 0.7) * k], region: 'robots' });
  }
  obstacles.push({ name: 'platform', frame: F2, min: [px - P.width / 2, 0, pz - P.depth / 2], max: [px + P.width / 2, P.height, pz + P.depth / 2], region: 'robots' });
  for (const b of blocks) {
    obstacles.push({ name: b.name, frame: b.frame, min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2], max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2], region: b.region, ...(b.until === undefined ? {} : { until: b.until }) });
  }
  // Floating photos at every height through the whole room, some resting near the floor, and a few large ones
  // the camera passes close by (original 128–145 s). None may touch the camera path or the dive over the platform.
  const diveStart = requireSegment(sequence, 'dive').start;
  const pathF2: Vec3[] = [];
  for (let t = robotsSeg.start; t <= diveStart; t += 0.25) pathF2.push(toLocal(F2, track.pos.at(t)));
  const clearance = (q: Vec3) => Math.min(...pathF2.map((c) => Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2])));
  const overPlatform = (q: Vec3) => Math.abs(q[0] - px) < P.width / 2 + 1.5 && Math.abs(q[2] - pz) < P.depth / 2 + 1.5 && q[1] < 5.5;
  const floaters: Gallery['robots']['floaters'] = [];
  for (let i = 0; floaters.length < ROBOTS.floaters && i < ROBOTS.floaters * 20; i++) {
    const q: Vec3 = [px + lerp(-14, 14, rnd()), rnd() < 0.2 ? lerp(0.12, 0.8, rnd()) : lerp(0.8, 7.5, rnd()), lerp(zBack + 0.5, 2.5, rnd())];
    if (overPlatform(q) || clearance(q) < 1) continue;
    floaters.push({ photoIndex: Math.floor(rnd() * n), pos: q, size: lerp(0.18, 0.45, rnd()), phase: rnd() * Math.PI * 2 });
  }
  const orbitFrom = Math.floor(pathF2.length * 0.45);
  // The camera orbits looking at the platform, so the large photos stand a little ahead along its motion and
  // just outside the orbit: they enter at the edge of the frame, pass close by and slide out (original 129–142 s).
  for (let k = 0; k < ROBOTS.large; k++) {
    const i = orbitFrom + Math.floor(((k + 0.5) / ROBOTS.large) * (pathF2.length - 3 - orbitFrom));
    const c = pathF2[i];
    const ahead = [pathF2[i + 2][0] - c[0], pathF2[i + 2][2] - c[2]];
    const len = Math.hypot(ahead[0], ahead[1]) || 1;
    const [tx, tz] = [ahead[0] / len, ahead[1] / len];
    const out = [c[0] - px, c[2] - pz];
    const olen = Math.hypot(out[0], out[1]) || 1;
    const [ox, oz] = [out[0] / olen, out[1] / olen];
    for (let tries = 0; tries < 8; tries++) {
      const off = 1.3 + 0.15 * tries + 0.6 * rnd();
      const fwd = lerp(0.5, 2.5, rnd());
      const q: Vec3 = [c[0] + ox * off + tx * fwd, lerp(0.5, 2.2, rnd()), c[2] + oz * off + tz * fwd];
      const d = clearance(q);
      if (overPlatform(q) || d <= 1.2 || d >= 4) continue;
      floaters.push({ photoIndex: Math.floor(rnd() * n), pos: q, size: lerp(0.8, 1.3, rnd()), phase: rnd() * Math.PI * 2 });
      break;
    }
  }

  const carpet: Vec3 = [0, P.height + 0.006, 0];
  const featured = [
    ...new Set([
      portraitIndex,
      ...(portraits?.items.map((i) => i.photoIndex) ?? []),
      ...(location?.boxes.map((b) => b.photoIndex) ?? []),
      ...(hall ? [hall.videos.photoIndex] : []),
      ...floaters.filter((f) => f.size >= 0.8).map((f) => f.photoIndex),
    ]),
  ];

  return {
    speed: V,
    track,
    walls,
    floors,
    blocks,
    obstacles,
    labels,
    wall: { ...texts, blockText },
    portraits,
    photos,
    location,
    words: wordsRoom,
    hall,
    robots: { frame: F2, platform: { center: platformCenter, width: P.width, depth: P.depth, height: P.height }, arms, floaters },
    finale: { frame: diveFrame, carpet, lifted: [0, ROBOTS.liftY, 0], network: networkLayout(n, portraitIndex, rnd), card: [0, -200, 0], carpetYaw: -TRACK.robots.orbit },
    featured,
    portraitIndex,
  };
}
