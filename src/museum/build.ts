import { Color, DirectionalLight, HemisphereLight, Line, Mesh, Scene, type Material, type MeshBasicMaterial } from 'three';
import type { TextureFactory } from '../assets/texture-factory';
import type { SceneId, Timeline } from '../types';
import { buildRoomShell } from './architecture';
import type { MuseumContent, SceneContext, SceneObject } from './context';
import type { Layout } from './layout';
import { createMaterials } from './materials';
import { buildCorridor } from './scenes/corridor';
import { buildFinale } from './scenes/finale';
import { buildGallery } from './scenes/gallery';
import { buildHall } from './scenes/hall';
import { buildKeywords } from './scenes/keywords';
import { buildNetwork } from './scenes/network';
import { buildOpening } from './scenes/opening';

export type { MuseumContent } from './context';

export interface MuseumScene {
  scene: Scene;
  update(t: number): void;
  dispose(): void;
}

const BUILDERS: Record<SceneId, (ctx: SceneContext) => SceneObject> = {
  opening: buildOpening,
  hall: buildHall,
  corridor: buildCorridor,
  gallery: buildGallery,
  keywords: buildKeywords,
  network: buildNetwork,
  finale: buildFinale,
};

export function buildMuseum(timeline: Timeline, layout: Layout, content: MuseumContent, tex: TextureFactory): MuseumScene {
  if (content.photos.length !== layout.corridorSlots.length) throw new Error('museum content does not match the layout');
  if (timeline.scenes.length !== layout.rooms.length) throw new Error('layout does not match the timeline');

  const scene = new Scene();
  scene.background = new Color(0xffffff);
  scene.add(new HemisphereLight(0xffffff, 0xe8e4dc, 1.1));
  const sun = new DirectionalLight(0xffffff, 0.8);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const mats = createMaterials(tex.glow());
  const updaters: ((t: number) => void)[] = [];
  layout.rooms.forEach((room, i) => {
    scene.add(buildRoomShell(room, mats));
    const built = BUILDERS[room.id]({ room, span: timeline.scenes[i], layout, content, tex, mats });
    scene.add(built.group);
    if (built.update) updaters.push(built.update);
  });

  return {
    scene,
    update(t) {
      for (const u of updaters) u(t);
    },
    dispose() {
      scene.traverse((obj) => {
        if (!(obj instanceof Mesh || obj instanceof Line)) return;
        obj.geometry.dispose();
        const material = obj.material as Material;
        if (material.userData.ownsMap) {
          (material as MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
      });
      mats.dispose();
    },
  };
}
