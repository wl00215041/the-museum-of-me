import type { SceneId, Timeline, Vec3 } from '../types';
import { lerp } from '../util/math';
import { mulberry32 } from '../util/rng';

export const EYE = 1.6;
export const DOOR = { width: 3.2, height: 3.6 } as const;
export const WALL_T = 0.15;
export const ROOM_GAP = WALL_T * 2;
/** Mat + molding on each side of a photo, as a fraction of the photo's longer edge. */
export const FRAME_SIDE = 0.12;

export const CORRIDOR = {
  width: 6, height: 4.5, perColumn: 6, colSpacing: 1.6, firstColumn: 3, rowY: [1.15, 2.1, 3.05], outerMax: 0.86,
} as const;
export const GALLERY = {
  width: 10, height: 5, spacing: 4.6, firstStop: 3.5, groupMaxWidth: 3.4, gap: 0.3,
  singleMaxHeight: 2.4, multiMaxHeight: 1.8, centerY: 1.75, cameraDistance: 3.3,
} as const;
export const KEYWORDS = { halfWidth: 6, minY: 3.2, maxY: 6.2, halfDepth: 3.5, maxHeight: 0.9, minHeight: 0.35 } as const;
export const NETWORK = { radius: 3.2, centerY: 4.4 } as const;

const FIXED_ROOMS = {
  opening: { width: 14, height: 7, length: 10 },
  hall: { width: 14, height: 8, length: 14 },
  keywords: { width: 16, height: 8, length: 16 },
  network: { width: 16, height: 10, length: 16 },
  finale: { width: 14, height: 8, length: 16 },
} as const;

export interface Room {
  id: SceneId;
  z0: number;
  z1: number;
  width: number;
  height: number;
  entryDoor: boolean;
  exitDoor: boolean;
}

export interface WallBox {
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
}

export interface PhotoSlot extends WallBox {
  photoIndex: number;
}

export interface GalleryStopLayout {
  photoIndices: number[];
  slots: PhotoSlot[];
  plaque: WallBox;
  /** Centre of the photo group on the wall. */
  center: Vec3;
  /** Total framed width of the photo group along the wall. */
  width: number;
  camera: Vec3;
  target: Vec3;
}

export interface KeywordItem {
  text: string;
  center: Vec3;
  height: number;
  width: number;
}

export interface NetworkLayout {
  center: Vec3;
  /** Node positions relative to `center`. */
  nodes: Vec3[];
  edges: [number, number][];
  nodeSize: number;
}

export interface Layout {
  rooms: Room[];
  title: WallBox;
  hallPortrait: PhotoSlot;
  corridorSlots: PhotoSlot[];
  galleryStops: GalleryStopLayout[];
  keywords: KeywordItem[];
  network: NetworkLayout | null;
  finalePortrait: PhotoSlot;
  visitor: Vec3;
}

export interface LayoutInput {
  timeline: Timeline;
  aspects: number[];
  portraitIndex: number;
  keywords: string[];
  seed: number;
}

export function getRoom(layout: Layout, id: SceneId): Room {
  const room = layout.rooms.find((r) => r.id === id);
  if (!room) throw new Error(`room "${id}" is not part of this layout`);
  return room;
}

export const roomCenterZ = (room: Room): number => (room.z0 + room.z1) / 2;

export function fitBox(aspect: number, maxW: number, maxH: number): { width: number; height: number } {
  return aspect >= maxW / maxH ? { width: maxW, height: maxW / aspect } : { width: maxH * aspect, height: maxH };
}

export function framedOuter(width: number, height: number): { width: number; height: number } {
  const side = FRAME_SIDE * Math.max(width, height);
  return { width: width + 2 * side, height: height + 2 * side };
}

/** Photo size whose framed outer size fits inside maxW × maxH. */
export function fitFramed(aspect: number, maxW: number, maxH: number): { width: number; height: number } {
  const k = 2 * FRAME_SIDE * Math.max(aspect, 1);
  const height = Math.min(maxW / (aspect + k), maxH / (1 + k));
  return { width: aspect * height, height };
}

/** Rough text width in units of the text height (CJK ≈ 1 em, latin ≈ 0.6 em, plus padding). */
export function estimateTextWidth(text: string): number {
  let width = 0.6;
  for (const ch of text) width += ch.codePointAt(0)! >= 0x2e80 ? 1 : 0.6;
  return width;
}

function roomSize(id: SceneId, photoCount: number, stopCount: number): { width: number; height: number; length: number } {
  if (id === 'corridor') {
    const columns = Math.ceil(photoCount / CORRIDOR.perColumn);
    return { width: CORRIDOR.width, height: CORRIDOR.height, length: Math.max(20, columns * CORRIDOR.colSpacing + 6) };
  }
  if (id === 'gallery') return { width: GALLERY.width, height: GALLERY.height, length: stopCount * GALLERY.spacing + 3 };
  return FIXED_ROOMS[id];
}

function portraitSlot(photoIndex: number, aspect: number, center: Vec3, normal: Vec3, maxW: number, maxH: number): PhotoSlot {
  return { photoIndex, center, normal, ...fitFramed(aspect, maxW, maxH) };
}

function corridorSlots(room: Room, aspects: number[]): PhotoSlot[] {
  return aspects.map((aspect, photoIndex) => {
    const column = Math.floor(photoIndex / CORRIDOR.perColumn);
    const k = photoIndex % CORRIDOR.perColumn;
    const side = k < 3 ? -1 : 1;
    const z = room.z0 - CORRIDOR.firstColumn - column * CORRIDOR.colSpacing - (side > 0 ? CORRIDOR.colSpacing / 2 : 0);
    return {
      photoIndex,
      center: [side * (CORRIDOR.width / 2), CORRIDOR.rowY[k % 3], z],
      normal: [-side, 0, 0],
      ...fitFramed(aspect, CORRIDOR.outerMax, CORRIDOR.outerMax),
    };
  });
}

function galleryStops(room: Room, timeline: Timeline, aspects: number[]): GalleryStopLayout[] {
  const wallX = -GALLERY.width / 2;
  return timeline.galleryStops.map((stop, k) => {
    const zk = room.z0 - GALLERY.firstStop - k * GALLERY.spacing;
    const count = stop.photoIndices.length;
    const cellW = (GALLERY.groupMaxWidth - (count - 1) * GALLERY.gap) / count;
    const cellH = count === 1 ? GALLERY.singleMaxHeight : GALLERY.multiMaxHeight;
    const sizes = stop.photoIndices.map((i) => fitFramed(aspects[i], cellW, cellH));
    const outers = sizes.map((s) => framedOuter(s.width, s.height).width);
    const width = outers.reduce((a, b) => a + b, 0) + (count - 1) * GALLERY.gap;
    // Facing the left wall (looking -X) the viewer's right is -Z, so the first photo sits at +Z.
    let cursor = zk + width / 2;
    const slots = stop.photoIndices.map((photoIndex, j): PhotoSlot => {
      const z = cursor - outers[j] / 2;
      cursor -= outers[j] + GALLERY.gap;
      return { photoIndex, center: [wallX, GALLERY.centerY, z], normal: [1, 0, 0], ...sizes[j] };
    });
    const focusZ = zk - 0.25;
    return {
      photoIndices: [...stop.photoIndices],
      slots,
      plaque: { center: [wallX, 1.3, zk - width / 2 - 0.5], normal: [1, 0, 0], width: 0.62, height: 0.42 },
      center: [wallX, GALLERY.centerY, zk],
      width,
      camera: [wallX + GALLERY.cameraDistance, EYE, focusZ],
      target: [wallX, 1.7, focusZ],
    };
  });
}

function keywordItems(room: Room, words: string[], seed: number): KeywordItem[] {
  const rnd = mulberry32(seed);
  const zc = roomCenterZ(room);
  const maxWidth = 2 * KEYWORDS.halfWidth - 1;
  const items: KeywordItem[] = [];
  const overlaps = (o: KeywordItem, c: Vec3, w: number, h: number) =>
    Math.abs(o.center[2] - c[2]) < 1 &&
    Math.abs(o.center[0] - c[0]) < (o.width + w) / 2 + 0.15 &&
    Math.abs(o.center[1] - c[1]) < (o.height + h) / 2 + 0.15;

  words.forEach((text, i) => {
    const est = estimateTextWidth(text);
    let height = words.length === 1 ? KEYWORDS.maxHeight : lerp(KEYWORDS.maxHeight, KEYWORDS.minHeight, i / (words.length - 1));
    if (est * height > maxWidth) height = maxWidth / est;
    const width = est * height;
    let center: Vec3 = [0, KEYWORDS.minY, zc];
    for (let attempt = 0; attempt < 40; attempt++) {
      center = [
        lerp(-KEYWORDS.halfWidth + width / 2, KEYWORDS.halfWidth - width / 2, rnd()),
        lerp(KEYWORDS.minY, KEYWORDS.maxY, rnd()),
        lerp(zc - KEYWORDS.halfDepth, zc + KEYWORDS.halfDepth, rnd()),
      ];
      if (!items.some((o) => overlaps(o, center, width, height))) break;
    }
    items.push({ text, center, height, width });
  });
  return items;
}

function fibonacciSphere(n: number, radius: number): Vec3[] {
  if (n === 1) return [[0, 0, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i): Vec3 => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius];
  });
}

function nearestEdges(nodes: Vec3[]): [number, number][] {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  nodes.forEach((p, i) => {
    const nearest = nodes
      .map((q, j) => ({ j, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of nearest) {
      const edge: [number, number] = [Math.min(i, j), Math.max(i, j)];
      const key = `${edge[0]}-${edge[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(edge);
      }
    }
  });
  return edges;
}

export function computeLayout(input: LayoutInput): Layout {
  const { timeline, aspects } = input;
  const n = aspects.length;
  if (n === 0) throw new Error('layout needs at least one photo');
  const portraitIndex = Math.min(Math.max(0, input.portraitIndex), n - 1);
  const portraitAspect = aspects[portraitIndex];

  let z = 0;
  const rooms = timeline.scenes.map((scene, i): Room => {
    const size = roomSize(scene.id, n, timeline.galleryStops.length);
    const room: Room = {
      id: scene.id, z0: z, z1: z - size.length, width: size.width, height: size.height,
      entryDoor: i > 0, exitDoor: i < timeline.scenes.length - 1,
    };
    z = room.z1 - ROOM_GAP;
    return room;
  });
  const find = (id: SceneId) => rooms.find((r) => r.id === id);
  const need = (id: SceneId) => {
    const room = find(id);
    if (!room) throw new Error(`timeline is missing required scene "${id}"`);
    return room;
  };

  const opening = need('opening');
  const hall = need('hall');
  const finale = need('finale');
  const keywordRoom = find('keywords');
  const networkRoom = find('network');
  const nodes = fibonacciSphere(n, NETWORK.radius);

  return {
    rooms,
    title: { center: [0, 5.25, opening.z1], normal: [0, 0, 1], width: 11, height: 2.6 },
    hallPortrait: portraitSlot(portraitIndex, portraitAspect, [-hall.width / 2, 3.8, roomCenterZ(hall)], [1, 0, 0], 6, 4.6),
    corridorSlots: corridorSlots(need('corridor'), aspects),
    galleryStops: galleryStops(need('gallery'), timeline, aspects),
    keywords: keywordRoom ? keywordItems(keywordRoom, input.keywords, input.seed) : [],
    network: networkRoom
      ? {
          center: [0, NETWORK.centerY, roomCenterZ(networkRoom)],
          nodes,
          edges: nearestEdges(nodes),
          nodeSize: n > 30 ? 0.45 : 0.6,
        }
      : null,
    finalePortrait: portraitSlot(portraitIndex, portraitAspect, [0, 3.9, finale.z1], [0, 0, 1], 7.5, 5.2),
    visitor: [0.35, 0, finale.z1 + 4.5],
  };
}
