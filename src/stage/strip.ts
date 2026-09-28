import { requireSegment } from '../plan/sequence';
import type { SegmentId, Sequence, Vec3 } from '../types';
import { clamp, lerp, smoothstep } from '../util/math';
import { mulberry32 } from '../util/rng';
import { networkLayout, photoSwarm, pickSpread, spot, type CanvasItem, type NetworkLayout, type VisitorSpot } from './placement';

export const LINE = { z: 7, eye: 1.6, lookY: 1.85, fov: 38, baseSpeed: 1.1, yaw0: (18 * Math.PI) / 180 } as const;
export const TEXT = {
  titleWidth: 5, titleHeight: 1.5, exhibitionWidth: 6.5, exhibitionHeight: 2.6,
  introTextWidth: 3.6, introHeight: 1.0, avatar: 0.9, gap: 0.8, endMargin: 1,
} as const;
export const BOUNDARY = { depth: 4.5, lowDepth: 0.8, partition: 0.6, pillarZ: 5.4, pillarWidth: 1.1, pillarDepth: 0.5 } as const;
export const CARPET = { cols: 64, rows: 36, pitch: 0.15, tile: 0.14 } as const;
/** Words push-in: z from LINE.z to `z` over [start, end] of the words segment; the next segment pulls back over its first `pullBack`. */
export const PUSH = { start: 0.3, end: 0.9, z: 1.5, pullBack: 0.2 } as const;
export const ROBOTS = { extend: 16, platform: { width: 10, depth: 6, height: 0.35 }, platformZ: -2, lead: 1.5, liftY: 3, floaters: 280 } as const;
export const WALK_SEGMENTS: readonly SegmentId[] = ['title', 'exhibition', 'intro', 'portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots'];

export type RoomId = 'wall' | 'portraits' | 'photos' | 'moments' | 'words' | 'likes' | 'videos' | 'robots';

const ROOM_OF: Partial<Record<SegmentId, RoomId>> = {
  title: 'wall', exhibition: 'wall', intro: 'wall', portraits: 'portraits', photos: 'photos',
  moments: 'moments', words: 'words', likes: 'likes', videos: 'videos', robots: 'robots',
};
const DARK: Record<RoomId, boolean> = { wall: false, portraits: false, photos: false, moments: true, words: true, likes: true, videos: true, robots: false };
const BACK_Z: Record<RoomId, number> = { wall: 0, portraits: 0, photos: 0, moments: 0, words: -5, likes: 0, videos: 0, robots: -10 };

export interface Room {
  id: RoomId;
  x0: number;
  x1: number;
  backZ: number;
  dark: boolean;
  height: number;
}

export interface Boundary {
  x: number;
  left: Room;
  right: Room;
  /** After the Words push-in the camera runs at z = PUSH.z, so this boundary stops short and has no pillar. */
  low: boolean;
}

export interface Box {
  name: string;
  min: Vec3;
  max: Vec3;
}

export interface WallText {
  center: Vec3;
  width: number;
  height: number;
}

export interface Label {
  text: string;
  number: string;
  at: Vec3;
  dark: boolean;
}

export interface Monitor {
  center: Vec3;
  /** Facing direction of the screen (unit, on the xz plane). */
  normal: Vec3;
  width: number;
  height: number;
  bars: boolean;
  photoIndex: number;
}

export interface Strip {
  speed: number;
  /** End time of the walking part (the robots segment). */
  walkEnd: number;
  tTitle: number;
  tPar: number;
  tEx: number;
  rooms: Room[];
  boundaries: Boundary[];
  obstacles: Box[];
  wall: { title: WallText; exhibition: WallText; intro: (WallText & { avatar: CanvasItem }) | null };
  portraits: { label: Label; items: CanvasItem[]; visitors: VisitorSpot[] } | null;
  photos: { label: Label; items: CanvasItem[]; visitors: VisitorSpot[] };
  moments: { label: Label; boxes: CanvasItem[]; visitors: VisitorSpot[] } | null;
  words: { label: Label; wall: WallText; visitors: VisitorSpot[] } | null;
  likes: { label: Label; sculpture: Vec3; monitors: Monitor[]; visitors: VisitorSpot[] } | null;
  videos: {
    label: Label;
    photoIndex: number;
    panels: { col: number; row: number; center: Vec3; width: number; height: number }[];
    monitors: Monitor[];
    visitors: VisitorSpot[];
  } | null;
  robots: {
    platform: { center: Vec3; width: number; depth: number; height: number };
    arms: { pos: Vec3; yaw: number; phase: number }[];
    floaters: { photoIndex: number; pos: Vec3; size: number; phase: number }[];
  };
  finale: { carpet: Vec3; lifted: Vec3; network: NetworkLayout; card: Vec3 };
  featured: number[];
  portraitIndex: number;
}

export interface StripInput {
  sequence: Sequence;
  aspects: number[];
  portraitIndex: number;
  seed: number;
}

export const yawAt = (strip: Pick<Strip, 'tPar'>, t: number): number => LINE.yaw0 * (1 - smoothstep(0, strip.tPar, t));

export function roomAtX(strip: Pick<Strip, 'rooms'>, x: number): Room {
  for (const room of strip.rooms) if (x < room.x1) return room;
  return strip.rooms[strip.rooms.length - 1];
}

interface WallTimes {
  tTitle: number;
  tPar: number;
  tEx: number;
  tIntro: number | null;
  wallEnd: number;
}

function wallTexts(V: number, times: WallTimes): { wall: Strip['wall']; fits: boolean } {
  const focus = (t: number) => V * t + LINE.z * Math.tan(yawAt(times, t));
  const title: WallText = { center: [focus(times.tTitle) + 0.4, 2.55, 0], width: TEXT.titleWidth, height: TEXT.titleHeight };
  const exX = V * times.tEx;
  const exhibition: WallText = { center: [exX, 2.25, 0], width: TEXT.exhibitionWidth, height: TEXT.exhibitionHeight };
  const exRight = exX + TEXT.exhibitionWidth / 2;
  let intro: Strip['wall']['intro'] = null;
  let lastRight = exRight;
  if (times.tIntro !== null) {
    const blockW = TEXT.avatar + 0.2 + TEXT.introTextWidth;
    const blockCenter = Math.max(V * times.tIntro, exRight + TEXT.gap + blockW / 2);
    const left = blockCenter - blockW / 2;
    intro = {
      center: [left + TEXT.avatar + 0.2 + TEXT.introTextWidth / 2, 2.45, 0],
      width: TEXT.introTextWidth,
      height: TEXT.introHeight,
      avatar: { photoIndex: -1, center: [left + TEXT.avatar / 2, 2.45, 0], width: TEXT.avatar, height: TEXT.avatar },
    };
    lastRight = left + blockW;
  }
  const fits =
    title.center[0] + TEXT.titleWidth / 2 + TEXT.gap <= exX - TEXT.exhibitionWidth / 2 &&
    lastRight + TEXT.endMargin <= V * times.wallEnd;
  return { wall: { title, exhibition, intro }, fits };
}

const label = (text: string, number: string, room: Room): Label => ({ text, number, at: [room.x0 + 1.5, 1.5, room.backZ + 0.01], dark: room.dark });

export function computeStrip(input: StripInput): Strip {
  const { sequence, aspects } = input;
  const n = aspects.length;
  if (n === 0) throw new Error('the strip needs at least one photo');
  const portraitIndex = clamp(Math.round(input.portraitIndex), 0, n - 1);
  const rnd = mulberry32(input.seed);
  const walk = sequence.segments.filter((s) => WALK_SEGMENTS.includes(s.id));
  const title = requireSegment(sequence, 'title');
  const exhibition = requireSegment(sequence, 'exhibition');
  const intro = sequence.segments.find((s) => s.id === 'intro') ?? null;
  const wallSegments = walk.filter((s) => ROOM_OF[s.id] === 'wall');
  const exDur = exhibition.end - exhibition.start;
  const times: WallTimes = {
    tTitle: title.start + 0.3 * (title.end - title.start),
    tPar: exhibition.start + 0.2 * exDur,
    tEx: exhibition.start + 0.55 * exDur,
    tIntro: intro ? (intro.start + intro.end) / 2 : null,
    wallEnd: wallSegments[wallSegments.length - 1].end,
  };

  let V: number = LINE.baseSpeed;
  let texts = wallTexts(V, times);
  for (let i = 0; i < 200 && !texts.fits; i++) texts = wallTexts((V *= 1.02), times);
  if (texts.wall.intro) texts.wall.intro.avatar.photoIndex = portraitIndex;

  const rooms: Room[] = [];
  for (const segment of walk) {
    const id = ROOM_OF[segment.id]!;
    const last = rooms[rooms.length - 1];
    if (last && last.id === id) last.x1 = V * segment.end;
    else rooms.push({ id, x0: V * segment.start, x1: V * segment.end, backZ: BACK_Z[id], dark: DARK[id], height: id === 'robots' ? 10 : 6 });
  }
  const robotsRoom = rooms[rooms.length - 1];
  if (robotsRoom.id !== 'robots') throw new Error('the walk must end in the robot room');
  const walkEnd = walk[walk.length - 1].end;
  robotsRoom.x1 = V * walkEnd + ROBOTS.extend;

  const boundaries: Boundary[] = rooms.slice(1).map((right, i) => ({ x: right.x0, left: rooms[i], right, low: rooms[i].id === 'words' }));
  const obstacles: Box[] = [];
  for (const b of boundaries) {
    const depth = b.low ? BOUNDARY.lowDepth : BOUNDARY.depth;
    const h = Math.max(b.left.height, b.right.height);
    obstacles.push({ name: 'partition', min: [b.x - BOUNDARY.partition / 2, 0, Math.min(b.left.backZ, b.right.backZ)], max: [b.x + BOUNDARY.partition / 2, h, depth] });
    if (!b.low) {
      obstacles.push({
        name: 'pillar',
        min: [b.x - BOUNDARY.pillarWidth / 2, 0, BOUNDARY.pillarZ - BOUNDARY.pillarDepth / 2],
        max: [b.x + BOUNDARY.pillarWidth / 2, h, BOUNDARY.pillarZ + BOUNDARY.pillarDepth / 2],
      });
    }
  }

  const room = (id: RoomId) => rooms.find((r) => r.id === id) ?? null;
  let sectionNo = 0;
  let likesNo = 0;

  let portraits: Strip['portraits'] = null;
  const pr = room('portraits');
  if (pr) {
    const len = pr.x1 - pr.x0;
    const xa = pr.x0 + 0.15 * len;
    const xb = pr.x1 - 0.1 * len;
    const k = Math.min(12, n, Math.max(1, Math.floor((xb - xa) / 1.6) + 1));
    const indices = pickSpread(n, k);
    const mid = (xa + xb) / 2;
    portraits = {
      label: label('Portraits', String(++sectionNo), pr),
      items: indices.map((photoIndex, i) => ({ photoIndex, center: [indices.length === 1 ? mid : lerp(xa, xb, i / (indices.length - 1)), 1.7, 0], width: 1, height: 1 })),
      visitors: [spot([mid - 0.8, 0, 2.7], 0, rnd), spot([mid + 0.9, 0, 3.0], 1, rnd)],
    };
  }

  const ph = room('photos')!;
  const phLen = ph.x1 - ph.x0;
  const swarmA = ph.x0 + 3;
  const swarmB = Math.max(swarmA + 4, ph.x1 - 1.5);
  const photos: Strip['photos'] = {
    label: label('Photos', String(++sectionNo), ph),
    items: photoSwarm(aspects, swarmA, swarmB, rnd),
    visitors: [
      spot([lerp(swarmA, swarmB, 0.28), 0, 2.4], 0, rnd),
      spot([lerp(swarmA, swarmB, 0.55), 0, 3.3], 2, rnd),
      spot([lerp(swarmA, swarmB, 0.82), 0, 2.8], 1, rnd),
      // Stands right in front of the lens, so parallax sweeps it across the frame (original, 44 s).
      spot([ph.x0 + 0.42 * phLen, 0, 5.9], 0, rnd),
    ],
  };

  let moments: Strip['moments'] = null;
  const mo = room('moments');
  if (mo) {
    const len = mo.x1 - mo.x0;
    const fit = Math.max(1, Math.floor((len - 4.5) / 1.8) + 1);
    const count = Math.min(6, fit, Math.max(4, n));
    const indices = count <= n ? pickSpread(n, count, 0.37) : Array.from({ length: count }, (_, i) => i % n);
    const xa = mo.x0 + 2.5;
    const xb = Math.max(xa, mo.x1 - 2);
    const boxes = indices.map((photoIndex, i): CanvasItem => ({
      photoIndex, center: [indices.length === 1 ? (xa + xb) / 2 : lerp(xa, xb, i / (indices.length - 1)), 1.9, 0], width: 1.3, height: 2.8,
    }));
    moments = {
      label: label('Moments', String(++sectionNo), mo),
      boxes,
      visitors: [spot([boxes[0].center[0] + 1.4, 0, 2.8], 2, rnd, true), spot([boxes[boxes.length - 1].center[0] - 1.8, 0, 3.2], 0, rnd, true)],
    };
  }

  let words: Strip['words'] = null;
  const wo = room('words');
  if (wo) {
    const mid = (wo.x0 + wo.x1) / 2;
    words = {
      label: label('Words', String(++sectionNo), wo),
      wall: { center: [mid, 2.9, wo.backZ + 0.01], width: clamp(wo.x1 - wo.x0 - 4, 4, 28), height: 5 },
      visitors: [spot([mid - 3, 0, -2.2], 0, rnd, true), spot([mid + 4, 0, -2.6], 1, rnd, true)],
    };
  }

  let likes: Strip['likes'] = null;
  const li = room('likes');
  if (li) {
    const len = li.x1 - li.x0;
    const mid = (li.x0 + li.x1) / 2;
    likesNo = ++sectionNo;
    const monitors: Monitor[] = [];
    const cols = Math.max(1, Math.min(7, Math.floor((len * 0.55 - 1.2) / 1.12)));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 4; r++) {
        monitors.push({ center: [li.x0 + 1.7 + c * 1.12, 1.21 + r * 0.76, 0.05], normal: [0, 0, 1], width: 1, height: 0.62, bars: (c + r) % 4 === 1, photoIndex: (c * 4 + r) % n });
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = mid + 2.5 + i * 1.4;
      if (x > li.x1 - 1) break;
      monitors.push({ center: [x, 1.25, 0.9], normal: [0, 0, 1], width: 0.9, height: 0.56, bars: i % 3 === 1, photoIndex: (i * 7 + 3) % n });
    }
    likes = {
      label: label('Likes', String(likesNo), li),
      sculpture: [mid, 0, 3.2],
      monitors,
      visitors: [spot([li.x0 + 2.5, 0, 2.2], 1, rnd, true), spot([mid + 3, 0, 1.6], 0, rnd, true)],
    };
  }

  let videos: Strip['videos'] = null;
  const vi = room('videos');
  if (vi) {
    const len = vi.x1 - vi.x0;
    const mid = (vi.x0 + vi.x1) / 2;
    const s = Math.min(1, (len - 3) / 8.18);
    const pw = 2 * s;
    const ph2 = 1.2 * s;
    const gap = 0.06 * s;
    const panels = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        panels.push({ col, row, center: [mid + (col - 1.5) * (pw + gap), 2.5 + (1 - row) * (ph2 + gap), 0.01] as Vec3, width: pw, height: ph2 });
      }
    }
    const monitors: Monitor[] = [];
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 4; r++) {
        monitors.push({ center: [vi.x1 - BOUNDARY.partition / 2 - 0.02, 1.2 + r * 0.7, 0.7 + c * 0.78], normal: [-1, 0, 0], width: 0.7, height: 0.5, bars: false, photoIndex: (c * 4 + r + 5) % n });
      }
    }
    videos = {
      label: label('Videos', likesNo ? `${likesNo}.2` : String(++sectionNo), vi),
      photoIndex: pickSpread(n, 1, 0.61)[0],
      panels,
      monitors,
      visitors: [spot([mid - 1, 0, 3.2], 0, rnd, true), spot([mid + 0.4, 0, 3.0], 2, rnd, true)],
    };
  }

  const endX = V * walkEnd;
  const p = ROBOTS.platform;
  const platformCenter: Vec3 = [endX - ROBOTS.lead, p.height / 2, ROBOTS.platformZ];
  // The last arm stands left of the dive so the camera brushes past it (original, 152 s).
  const armSpots = [[-6.2, 0.6, 0], [6.2, 0.2, 1.7], [-2.6, -4.2, 3.1], [3.0, -4.0, 4.6], [-6.0, 3.0, 2.3]] as const;
  const arms = armSpots.map(([dx, dz, phase]) => ({
    pos: [platformCenter[0] + dx, 0, platformCenter[2] + dz] as Vec3,
    yaw: Math.atan2(-dx, -dz),
    phase,
  }));
  for (const arm of arms) {
    const reach: Vec3 = [arm.pos[0] + Math.sin(arm.yaw) * 2.4, 0, arm.pos[2] + Math.cos(arm.yaw) * 2.4];
    obstacles.push({
      name: 'arm',
      min: [Math.min(arm.pos[0], reach[0]) - 0.7, 0, Math.min(arm.pos[2], reach[2]) - 0.7],
      max: [Math.max(arm.pos[0], reach[0]) + 0.7, 3.1, Math.max(arm.pos[2], reach[2]) + 0.7],
    });
  }
  obstacles.push({
    name: 'platform',
    min: [platformCenter[0] - p.width / 2, 0, platformCenter[2] - p.depth / 2],
    max: [platformCenter[0] + p.width / 2, p.height, platformCenter[2] + p.depth / 2],
  });
  if (likes) obstacles.push({ name: 'sculpture', min: [likes.sculpture[0] - 1.9, 0, likes.sculpture[2] - 1.9], max: [likes.sculpture[0] + 1.9, 4, likes.sculpture[2] + 1.9] });

  const floaters = Array.from({ length: ROBOTS.floaters }, () => ({
    photoIndex: Math.floor(rnd() * n),
    pos: [lerp(robotsRoom.x0 + 2, endX + 10, rnd()), lerp(1.2, 5.5, rnd()), lerp(-9.5, -3.5, rnd())] as Vec3,
    size: lerp(0.16, 0.34, rnd()),
    phase: rnd() * Math.PI * 2,
  }));

  const carpet: Vec3 = [platformCenter[0], p.height + 0.006, platformCenter[2]];
  const featured = [
    ...new Set([
      portraitIndex,
      ...(portraits?.items.map((i) => i.photoIndex) ?? []),
      ...(moments?.boxes.map((b) => b.photoIndex) ?? []),
      ...(videos ? [videos.photoIndex] : []),
    ]),
  ];

  return {
    speed: V,
    walkEnd,
    tTitle: times.tTitle,
    tPar: times.tPar,
    tEx: times.tEx,
    rooms,
    boundaries,
    obstacles,
    wall: texts.wall,
    portraits,
    photos,
    moments,
    words,
    likes,
    videos,
    robots: { platform: { center: platformCenter, width: p.width, depth: p.depth, height: p.height }, arms, floaters },
    finale: {
      carpet,
      lifted: [carpet[0], ROBOTS.liftY, carpet[2]],
      network: networkLayout(n, portraitIndex, rnd),
      card: [carpet[0], -200, carpet[2]],
    },
    featured,
    portraitIndex,
  };
}
