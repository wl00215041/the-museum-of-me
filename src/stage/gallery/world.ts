import { Color, DirectionalLight, Group, HemisphereLight, Scene } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import { findSegment, requireSegment } from '../../plan/sequence';
import type { Sequence } from '../../types';
import { smoothstep } from '../../util/math';
import { disposeScene } from '../dispose';
import type { Gallery } from '../gallery';
import { createStageMaterials } from '../parts/materials';
import { buildLabels } from './common';
import type { GalleryContent, GalleryContext, RoomObject } from './context';
import { buildFinale } from './finale';
import { buildHallRoom } from './rooms/hall';
import { buildLocationRoom } from './rooms/location';
import { buildPhotosRoom } from './rooms/photos';
import { buildPortraitsRoom } from './rooms/portraits';
import { buildRobotsRoom } from './rooms/robots';
import { buildWallRoom } from './rooms/wall';
import { buildWordsRoom } from './rooms/words';
import { buildGalleryShell } from './shell';

export interface GalleryWorld {
  scene: Scene;
  update(t: number): void;
  /** Bloom intensity at time t (the x argument is kept for the renderer's interface). */
  bloomAt(t: number, x: number): number;
  dispose(): void;
}

/** Gallery light level, measured against the original: its white walls sit at ~160 (sRGB), not near white. */
export const EXPOSURE = 0.35;
export const BLOOM = { light: 0.2, dark: 1.1, hall: 0.6, mosaic: 0.3, network: 0.5, ending: 0.25 } as const;

/** Bloom levels over time: dark rooms glow more, and every change is a ramp (review I3). */
export function bloomKeys(sequence: Sequence, gallery: Gallery): [number, number][] {
  const keys: [number, number][] = [[0, BLOOM.light]];
  let level: number = BLOOM.light;
  const ramp = (t0: number, t1: number, to: number) => {
    keys.push([t0, level], [t1, to]);
    level = to;
  };
  const pillar = gallery.track.wipes.find((w) => w.name === 'dark-pillar');
  const likes = findSegment(sequence, 'likes');
  const robots = requireSegment(sequence, 'robots');
  const dive = requireSegment(sequence, 'dive');
  const network = findSegment(sequence, 'network');
  if (pillar) ramp(pillar.mid - 0.6, pillar.mid + 0.6, BLOOM.dark);
  if (likes) ramp(likes.start, likes.start + 1.5, BLOOM.hall);
  ramp(robots.start - 0.6, robots.start + 0.6, BLOOM.light);
  ramp(dive.end - 0.2 * (dive.end - dive.start), dive.end, BLOOM.mosaic);
  if (network) ramp(network.start, network.start + Math.max(1.5, 0.12 * (network.end - network.start)), BLOOM.network);
  return keys;
}

export function bloomFrom(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + (v1 - v0) * smoothstep(t0, t1, t);
    }
  }
  return keys[keys.length - 1][1];
}

export function buildGalleryWorld(sequence: Sequence, gallery: Gallery, content: GalleryContent, tex: StageTextureFactory): GalleryWorld {
  const mats = createStageMaterials();
  const ctx: GalleryContext = { sequence, gallery, content, tex, mats };
  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new HemisphereLight(0xffffff, 0xcfcac2, 1.15 * EXPOSURE));
  const sun = new DirectionalLight(0xffffff, 0.5 * EXPOSURE);
  sun.position.set(-20, 30, 40);
  scene.add(sun);

  const shell = buildGalleryShell(ctx);
  const walk = new Group();
  walk.name = 'walk';
  walk.add(shell.walk, buildLabels(ctx));
  const robotsGroup = new Group();
  robotsGroup.name = 'robots';
  robotsGroup.add(shell.robots);
  // The robot room is the brightest space in the original (walls ~120–160 sRGB); this light lives only in its region.
  robotsGroup.add(new HemisphereLight(0xffffff, 0xcfcac2, 0.25));
  const both = new Group();
  both.name = 'both';
  both.add(shell.both);

  const walkUpdates: ((t: number) => void)[] = [];
  const disposers: (() => void)[] = [];
  const rooms: (RoomObject | null)[] = [buildWallRoom(ctx), buildPortraitsRoom(ctx), buildPhotosRoom(ctx), buildLocationRoom(ctx), buildWordsRoom(ctx), buildHallRoom(ctx)];
  for (const room of rooms) {
    if (!room) continue;
    walk.add(room.group);
    if (room.update) walkUpdates.push(room.update);
    if (room.dispose) disposers.push(room.dispose);
  }
  const robotsRoom = buildRobotsRoom(ctx);
  robotsGroup.add(robotsRoom.group);
  const finale = buildFinale(ctx);
  scene.add(walk, robotsGroup, both, finale.group);

  const robots = requireSegment(sequence, 'robots');
  const dive = requireSegment(sequence, 'dive');
  const ending = requireSegment(sequence, 'ending');
  const keys = bloomKeys(sequence, gallery);

  return {
    scene,
    update(t) {
      // The robot room takes over while the dark door covers the lens.
      walk.visible = t < robots.start;
      robotsGroup.visible = t >= robots.start && t < dive.end;
      both.visible = t < dive.end;
      for (const s of shell.timed) s.object.visible = t < s.until;
      if (walk.visible) for (const u of walkUpdates) u(t);
      robotsRoom.update!(t);
      finale.update!(t);
    },
    bloomAt(t) {
      return t >= ending.start ? BLOOM.ending : bloomFrom(keys, t);
    },
    dispose() {
      disposeScene(scene);
      for (const d of disposers) d();
      mats.dispose();
    },
  };
}
