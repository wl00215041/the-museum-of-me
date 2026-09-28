import { Color, DirectionalLight, Group, HemisphereLight, Scene } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import { findSegment, requireSegment } from '../../plan/sequence';
import type { Sequence } from '../../types';
import { smoothstep } from '../../util/math';
import { disposeScene } from '../dispose';
import { createStageMaterials } from '../parts/materials';
import type { Room, Strip } from '../strip';
import type { RoomObject, WorldContent, WorldContext } from './context';
import { buildFinale } from './finale';
import { buildLikesRoom } from './rooms/likes';
import { buildMomentsRoom } from './rooms/moments';
import { buildPhotosRoom } from './rooms/photos';
import { buildPortraitsRoom } from './rooms/portraits';
import { buildRobotsRoom } from './rooms/robots';
import { buildVideosRoom } from './rooms/videos';
import { buildWallRoom } from './rooms/wall';
import { buildWordsRoom } from './rooms/words';
import { buildShell } from './shell';

export interface World {
  scene: Scene;
  update(t: number): void;
  /** Bloom intensity for the camera at time t and x position (dark rooms glow more). */
  bloomAt(t: number, x: number): number;
  dispose(): void;
}

/** Gallery light level, measured against the original: its white walls sit at ~160 (sRGB), not near white. */
export const EXPOSURE = 0.35;
const BLOOM_LIGHT = 0.2;
const BLOOM_DARK = 1.1;
const bloomOf = (room: Room) => (room.dark ? BLOOM_DARK : BLOOM_LIGHT);

export function buildWorld(sequence: Sequence, strip: Strip, content: WorldContent, tex: StageTextureFactory): World {
  const mats = createStageMaterials();
  const ctx: WorldContext = { sequence, strip, content, tex, mats };
  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new HemisphereLight(0xffffff, 0xcfcac2, 1.15 * EXPOSURE));
  const sun = new DirectionalLight(0xffffff, 0.5 * EXPOSURE);
  sun.position.set(-20, 30, 40);
  scene.add(sun);

  const rooms = new Group();
  rooms.name = 'rooms';
  rooms.add(buildShell(ctx));
  const built: (RoomObject | null)[] = [
    buildWallRoom(ctx), buildPortraitsRoom(ctx), buildPhotosRoom(ctx), buildMomentsRoom(ctx),
    buildWordsRoom(ctx), buildLikesRoom(ctx), buildVideosRoom(ctx), buildRobotsRoom(ctx),
  ];
  const updaters: ((t: number) => void)[] = [];
  for (const room of built) {
    if (!room) continue;
    rooms.add(room.group);
    if (room.update) updaters.push(room.update);
  }
  const finale = buildFinale(ctx);
  scene.add(rooms, finale.group);

  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');

  return {
    scene,
    update(t) {
      rooms.visible = t < dive.end;
      if (rooms.visible) for (const u of updaters) u(t);
      finale.update!(t);
    },
    bloomAt(t, x) {
      if (t >= ending.start) return 0.25;
      if (network && t >= network.start) return BLOOM_DARK;
      if (t >= mosaic.start) return 0.3;
      if (t >= dive.start) return BLOOM_LIGHT;
      let nearest = strip.boundaries[0];
      for (const b of strip.boundaries) if (Math.abs(b.x - x) < Math.abs(nearest.x - x)) nearest = b;
      if (!nearest) return bloomOf(strip.rooms[0]);
      const k = smoothstep(nearest.x - 1.5, nearest.x + 1.5, x);
      return bloomOf(nearest.left) + (bloomOf(nearest.right) - bloomOf(nearest.left)) * k;
    },
    dispose() {
      disposeScene(scene);
      mats.dispose();
    },
  };
}
