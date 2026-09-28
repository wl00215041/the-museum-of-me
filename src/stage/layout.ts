import type { ShotId, Storyboard, Vec3 } from '../types';
import { clamp, lerp } from '../util/math';
import { mulberry32 } from '../util/rng';
import { WALL, WALL_TEXT, cameraX, titleX, wallRunOf, type WallRun } from './wall-run';

export const MAX_PORTRAITS = 12;
export const MAX_MOMENTS = 6;
export const MAX_NETWORK_NODES = 150;
export const ROBOT_TILES = { cols: 60, rows: 36, size: 0.15, pitch: 0.155 } as const;
export const FLOATERS = 280;
export const MOSAIC = { cols: 64, rows: 36, tile: 0.25 } as const;
export const STARS = 2400;
export const VIDEO_WALL = { cols: 4, rows: 3, panelWidth: 2, panelHeight: 1.2, gap: 0.06, centerY: 2.5 } as const;
export const LED_WALL = { width: 16, height: 5, centerY: 2.9 } as const;

export interface CanvasItem {
  photoIndex: number;
  center: Vec3;
  width: number;
  height: number;
}

export interface VisitorSpot {
  pos: Vec3;
  yaw: number;
  pose: 0 | 1 | 2;
  dark: boolean;
  scale: number;
}

export interface WallText {
  center: Vec3;
  width: number;
  height: number;
}

export interface WallLayout {
  run: WallRun;
  wallStart: number;
  wallEnd: number;
  title: WallText;
  intro: (WallText & { avatar: CanvasItem }) | null;
  exhibition: WallText;
  portraits: { label: Vec3; items: CanvasItem[] } | null;
  photos: { label: Vec3; items: CanvasItem[] };
  visitors: VisitorSpot[];
}

export interface MomentsLayout {
  boxes: CanvasItem[];
  cameraFrom: number;
  cameraTo: number;
  visitors: VisitorSpot[];
}

export interface WordsLayout {
  center: Vec3;
  width: number;
  height: number;
  visitors: VisitorSpot[];
}

export interface Monitor {
  center: Vec3;
  width: number;
  height: number;
  bars: boolean;
  photoIndex: number;
}

export interface LikesLayout {
  monitors: Monitor[];
  visitors: VisitorSpot[];
}

export interface VideosLayout {
  photoIndex: number;
  panels: { col: number; row: number; center: Vec3; width: number; height: number }[];
  visitors: VisitorSpot[];
}

export interface RobotsLayout {
  platform: { width: number; depth: number; height: number };
  tiles: { photoIndex: number; x: number; z: number; rotation: number }[];
  floaters: { photoIndex: number; pos: Vec3; size: number; phase: number }[];
  arms: { pos: Vec3; yaw: number; phase: number }[];
}

export interface NetworkLayout {
  nodes: { photoIndex: number; pos: Vec3; radius: number }[];
  /** Pairs of node indices; -1 is the central portrait sphere. */
  edges: [number, number][];
  /** Flat xyz star positions. */
  stars: number[];
  starEdges: [number, number][];
  highlights: number[];
}

export interface StageLayout {
  portraitIndex: number;
  /** Photos shown large enough to need a high-resolution texture; the portrait first. */
  featured: number[];
  wall: WallLayout;
  moments: MomentsLayout;
  words: WordsLayout;
  likes: LikesLayout;
  videos: VideosLayout;
  robots: RobotsLayout;
  mosaic: typeof MOSAIC;
  network: NetworkLayout;
}

export interface StageLayoutInput {
  storyboard: Storyboard;
  aspects: number[];
  portraitIndex: number;
  seed: number;
}

/** k distinct indices spread evenly over 0..n-1 (fewer when k > n). */
export function pickSpread(n: number, k: number, shift = 0.5): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(((i + shift) / k) * n) % n;
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return out;
}

const spot = (pos: Vec3, pose: 0 | 1 | 2, rnd: () => number, dark = false, yaw = Math.PI): VisitorSpot => ({
  pos, yaw, pose, dark, scale: 0.97 + rnd() * 0.06,
});

function canvasSize(aspect: number, long: number): { width: number; height: number } {
  return aspect >= 1 ? { width: long, height: long / aspect } : { width: long * aspect, height: long };
}

function overlapWithRecent(items: CanvasItem[], x: number, y: number, w: number, h: number): number {
  let total = 0;
  const margin = 0.06;
  for (let j = Math.max(0, items.length - 40); j < items.length; j++) {
    const o = items[j];
    const dx = Math.min(x + w / 2, o.center[0] + o.width / 2) - Math.max(x - w / 2, o.center[0] - o.width / 2) + margin;
    const dy = Math.min(y + h / 2, o.center[1] + o.height / 2) - Math.max(y - h / 2, o.center[1] - o.height / 2) + margin;
    if (dx > 0 && dy > 0) total += dx * dy;
  }
  return total;
}

/** Salon-style swarm rising from lower left to upper right, thickening as it goes. */
function photoSwarm(aspects: number[], xa: number, xb: number, rnd: () => number): CanvasItem[] {
  const n = aspects.length;
  const span = xb - xa;
  const base = clamp(Math.sqrt((span * 1.6) / n) * 0.72, 0.22, 0.95);
  const placed: CanvasItem[] = [];
  aspects.forEach((aspect, photoIndex) => {
    const u = (photoIndex + 0.5) / n;
    const long = base * (0.8 + 0.4 * rnd());
    const { width, height } = canvasSize(aspect, long);
    const centerY = lerp(1.25, 3.6, u ** 0.8);
    const thickness = lerp(0.4, 2.8, u);
    const x = xa + u * span + (rnd() - 0.5) * Math.min(span / n, 1.2) * 1.5;
    let best: Vec3 = [x, clamp(centerY, 0.6 + height / 2, WALL.height - 0.6 - height / 2), 0];
    let bestOverlap = Infinity;
    for (let k = 0; k < 12; k++) {
      const y = clamp(centerY + (rnd() - 0.5) * thickness, 0.6 + height / 2, WALL.height - 0.6 - height / 2);
      const cx = x + (rnd() - 0.5) * 0.3 * long;
      const overlap = overlapWithRecent(placed, cx, y, width, height);
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = [cx, y, 0];
        if (overlap === 0) break;
      }
    }
    placed.push({ photoIndex, center: best, width, height });
  });
  return placed;
}

function wallLayout(storyboard: Storyboard, aspects: number[], portraitIndex: number, rnd: () => number): WallLayout {
  const run = wallRunOf(storyboard);
  const span = (id: ShotId) => storyboard.shots.find((s) => s.id === id) ?? null;
  const n = aspects.length;
  const title: WallText = { center: [titleX(), 2.75, 0], width: WALL_TEXT.titleWidth, height: WALL_TEXT.titleHeight };
  const exhibitionX = cameraX(run, run.exhibitionTime);
  const exhibition: WallText = { center: [exhibitionX, 2.8, 0], width: WALL_TEXT.exhibitionWidth, height: WALL_TEXT.exhibitionHeight };
  const exRight = exhibitionX + WALL_TEXT.exhibitionWidth / 2;
  const visitors: VisitorSpot[] = [];

  let intro: WallLayout['intro'] = null;
  if (span('intro')) {
    const left = title.center[0] + WALL_TEXT.titleWidth / 2 + WALL_TEXT.gap;
    const right = exhibitionX - WALL_TEXT.exhibitionWidth / 2 - WALL_TEXT.gap;
    const blockWidth = WALL_TEXT.avatar + 0.2 + WALL_TEXT.introTextWidth;
    const blockLeft = (left + right) / 2 - blockWidth / 2;
    intro = {
      center: [blockLeft + WALL_TEXT.avatar + 0.2 + WALL_TEXT.introTextWidth / 2, 2.6, 0],
      width: WALL_TEXT.introTextWidth,
      height: WALL_TEXT.introHeight,
      avatar: { photoIndex: portraitIndex, center: [blockLeft + WALL_TEXT.avatar / 2, 2.6, 0], width: WALL_TEXT.avatar, height: WALL_TEXT.avatar },
    };
  }

  let portraits: WallLayout['portraits'] = null;
  let previousRight = exRight;
  const portraitsSpan = span('portraits');
  if (portraitsSpan) {
    const xa = Math.max(cameraX(run, portraitsSpan.start + 1.2), exRight + 1.5 + 0.5);
    const xb = Math.max(xa, cameraX(run, portraitsSpan.end - 0.4));
    const k = Math.min(MAX_PORTRAITS, n, Math.max(1, Math.floor((xb - xa) / 1.5) + 1));
    const indices = pickSpread(n, k);
    const items = indices.map((photoIndex, i): CanvasItem => ({
      photoIndex,
      center: [indices.length === 1 ? (xa + xb) / 2 : lerp(xa, xb, i / (indices.length - 1)), 1.75, 0],
      width: 1,
      height: 1,
    }));
    portraits = { label: [xa - 0.9, 1.55, 0], items };
    previousRight = items[items.length - 1].center[0] + 0.5;
    const mid = (xa + xb) / 2;
    visitors.push(spot([mid - 0.8, 0, 2.7], 0, rnd), spot([mid + 0.9, 0, 3.0], 1, rnd));
  }

  const photosSpan = span('photos');
  if (!photosSpan) throw new Error('storyboard must include the photos shot');
  const xa = Math.max(cameraX(run, photosSpan.start + 1.2), previousRight + 1.5 + 0.5);
  const xb = Math.max(xa + 4, cameraX(run, photosSpan.end - 0.3));
  const photos = { label: [xa - 0.9, 1.55, 0] as Vec3, items: photoSwarm(aspects, xa, xb, rnd) };
  for (const [u, z, pose] of [[0.28, 2.4, 0], [0.55, 3.3, 2], [0.82, 2.8, 1]] as const) {
    visitors.push(spot([lerp(xa, xb, u), 0, z], pose, rnd));
  }

  return { run, wallStart: -12, wallEnd: Math.max(xb, cameraX(run, run.end)) + 14, title, intro, exhibition, portraits, photos, visitors };
}

function momentsLayout(n: number, rnd: () => number): MomentsLayout {
  const indices = pickSpread(n, Math.min(MAX_MOMENTS, n), 0.37);
  const spacing = 3;
  const boxes = indices.map((photoIndex, i): CanvasItem => ({
    photoIndex, center: [(i - (indices.length - 1) / 2) * spacing, 1.9, 0], width: 1.3, height: 2.8,
  }));
  const first = boxes[0].center[0];
  const last = boxes[boxes.length - 1].center[0];
  return {
    boxes,
    cameraFrom: first - 2.5,
    cameraTo: last + 2.5,
    visitors: [spot([first + 1.4, 0, 2.8], 2, rnd, true), spot([last - 1.8, 0, 3.2], 0, rnd, true)],
  };
}

function likesLayout(n: number, rnd: () => number): LikesLayout {
  const monitors: Monitor[] = [];
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 4; r++) {
      monitors.push({
        center: [-1.5 + (c - 3) * 1.12, 1.21 + r * 0.76, -5],
        width: 1,
        height: 0.62,
        bars: (c + r) % 4 === 1,
        photoIndex: (c * 4 + r) % n,
      });
    }
  }
  return { monitors, visitors: [spot([-3.2, 0, 1.5], 1, rnd, true, 0.4), spot([2.8, 0, -2.5], 0, rnd, true, Math.PI)] };
}

function videosLayout(n: number, rnd: () => number): VideosLayout {
  const { cols, rows, panelWidth, panelHeight, gap, centerY } = VIDEO_WALL;
  const panels = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      panels.push({
        col, row,
        center: [(col - (cols - 1) / 2) * (panelWidth + gap), centerY + ((rows - 1) / 2 - row) * (panelHeight + gap), 0] as Vec3,
        width: panelWidth,
        height: panelHeight,
      });
    }
  }
  return {
    photoIndex: pickSpread(n, 1, 0.61)[0],
    panels,
    visitors: [spot([-1.0, 0, 3.2], 0, rnd, true), spot([0.4, 0, 3.0], 2, rnd, true)],
  };
}

function shuffle(n: number, rnd: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function robotsLayout(n: number, rnd: () => number): RobotsLayout {
  const { cols, rows, pitch } = ROBOT_TILES;
  const order = shuffle(n, rnd);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        photoIndex: order[(r * cols + c) % n],
        x: (c - (cols - 1) / 2) * pitch,
        z: (r - (rows - 1) / 2) * pitch,
        rotation: (rnd() - 0.5) * 0.16,
      });
    }
  }
  const floaters = Array.from({ length: FLOATERS }, () => ({
    photoIndex: Math.floor(rnd() * n),
    pos: [lerp(-10, 10, rnd()), lerp(1.2, 5.5, rnd()), lerp(-7, 1, rnd())] as Vec3,
    size: lerp(0.16, 0.34, rnd()),
    phase: rnd() * Math.PI * 2,
  }));
  const arms = ([[-6.2, 0.6, 0], [6.2, 0.2, 1.7], [-2.6, -4.2, 3.1], [3.0, -4.0, 4.6]] as const).map(([x, z, phase]) => ({
    pos: [x, 0, z] as Vec3,
    yaw: Math.atan2(-x, -z),
    phase,
  }));
  return { platform: { width: 10, depth: 6, height: 0.35 }, tiles, floaters, arms };
}

function fibonacci(count: number): Vec3[] {
  if (count === 1) return [[0, 1, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i): Vec3 => {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
  });
}

function networkLayout(n: number, portraitIndex: number, rnd: () => number): NetworkLayout {
  const others = Array.from({ length: n }, (_, i) => i).filter((i) => i !== portraitIndex);
  const picked = others.length <= MAX_NETWORK_NODES ? others : pickSpread(others.length, MAX_NETWORK_NODES).map((i) => others[i]);
  const dirs = fibonacci(Math.max(1, picked.length));
  const nodes = picked.map((photoIndex, i) => {
    const r = lerp(3, 7, rnd());
    const [x, y, z] = dirs[i];
    return { photoIndex, pos: [x * r, y * r, z * r] as Vec3, radius: lerp(0.16, 0.3, rnd()) };
  });
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    edges.push([Math.min(a, b), Math.max(a, b)]);
  };
  for (let i = 0; i < Math.min(24, nodes.length); i++) add(-1, i);
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) }))
      .filter((x) => x.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => add(i, j));
  });
  const stars: number[] = [];
  for (const [x, y, z] of fibonacci(STARS)) {
    const r = lerp(8, 16, rnd());
    stars.push(x * r, y * r, z * r);
  }
  const starEdges: [number, number][] = [];
  for (let i = 0; i < STARS; i += 2) {
    if (i + 21 < STARS) starEdges.push([i, i + 21]);
    if (i + 34 < STARS) starEdges.push([i, i + 34]);
  }
  const highlights = Array.from({ length: Math.ceil(STARS / 60) }, (_, k) => k * 60);
  return { nodes, edges, stars, starEdges, highlights };
}

export function computeStageLayout(input: StageLayoutInput): StageLayout {
  const n = input.aspects.length;
  if (n === 0) throw new Error('stage layout needs at least one photo');
  const portraitIndex = clamp(Math.round(input.portraitIndex), 0, n - 1);
  const rnd = mulberry32(input.seed);
  const wall = wallLayout(input.storyboard, input.aspects, portraitIndex, rnd);
  const moments = momentsLayout(n, rnd);
  const words: WordsLayout = {
    center: [0, LED_WALL.centerY, 0],
    width: LED_WALL.width,
    height: LED_WALL.height,
    visitors: [spot([-3.5, 0, 3.0], 0, rnd, true), spot([4.5, 0, 2.4], 1, rnd, true)],
  };
  const likes = likesLayout(n, rnd);
  const videos = videosLayout(n, rnd);
  const robots = robotsLayout(n, rnd);
  const network = networkLayout(n, portraitIndex, rnd);
  const featured = [
    ...new Set([
      portraitIndex,
      ...(wall.portraits?.items.map((i) => i.photoIndex) ?? []),
      ...moments.boxes.map((b) => b.photoIndex),
      videos.photoIndex,
    ]),
  ];
  return { portraitIndex, featured, wall, moments, words, likes, videos, robots, mosaic: MOSAIC, network };
}
