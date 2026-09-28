import type { Vec3 } from '../types';
import { clamp, lerp } from '../util/math';

export const MAX_NETWORK_NODES = 150;
export const STARS = 2400;

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

export interface NetworkLayout {
  nodes: { photoIndex: number; pos: Vec3; radius: number }[];
  /** Pairs of node indices; -1 is the central portrait sphere. */
  edges: [number, number][];
  /** Flat xyz star positions. */
  stars: number[];
  starEdges: [number, number][];
  highlights: number[];
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

export const spot = (pos: Vec3, pose: 0 | 1 | 2, rnd: () => number, dark = false, yaw = Math.PI): VisitorSpot => ({
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

/** Salon-style swarm rising from lower left to upper right, thickening as it goes (the original's Photos wall). */
export function photoSwarm(aspects: number[], xa: number, xb: number, rnd: () => number, wallHeight = 6, z = 0): CanvasItem[] {
  const n = aspects.length;
  const span = xb - xa;
  const base = clamp(Math.sqrt((span * 1.6) / n) * 0.72, 0.22, 0.95);
  const placed: CanvasItem[] = [];
  aspects.forEach((aspect, photoIndex) => {
    const u = (photoIndex + 0.5) / n;
    const long = base * (0.8 + 0.4 * rnd());
    const { width, height } = canvasSize(aspect, long);
    const centerY = lerp(1.25, 3.4, u ** 0.8);
    const thickness = lerp(0.4, 2.4, u);
    const x = xa + u * span + (rnd() - 0.5) * Math.min(span / n, 1.2) * 1.5;
    let best: Vec3 = [x, clamp(centerY, 0.6 + height / 2, wallHeight - 0.6 - height / 2), z];
    let bestOverlap = Infinity;
    for (let k = 0; k < 12; k++) {
      const y = clamp(centerY + (rnd() - 0.5) * thickness, 0.6 + height / 2, wallHeight - 0.6 - height / 2);
      const cx = x + (rnd() - 0.5) * 0.3 * long;
      const overlap = overlapWithRecent(placed, cx, y, width, height);
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = [cx, y, z];
        if (overlap === 0) break;
      }
    }
    placed.push({ photoIndex, center: best, width, height });
  });
  return placed;
}

export function shuffle(n: number, rnd: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fibonacci(count: number): Vec3[] {
  if (count === 1) return [[0, 1, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i): Vec3 => {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
  });
}

/** Photo spheres around the portrait, each linked to its two nearest neighbours, inside a star shell. */
export function networkLayout(n: number, portraitIndex: number, rnd: () => number): NetworkLayout {
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
