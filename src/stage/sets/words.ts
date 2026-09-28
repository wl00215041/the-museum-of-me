import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { ShotId } from '../../types';
import { smoothstep } from '../../util/math';
import { spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { addDarkRoom, addVisitors, darkScene } from './common';

export function buildWordsSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, mats, storyboard } = ctx;
  const span = spanOf(storyboard, 'words');
  const w = layout.words;
  const scene = darkScene();
  addDarkRoom(scene, mats, 34, 16);
  const backing = new Mesh(new BoxGeometry(w.width + 0.4, w.height + 0.4, 0.2), mats.darkWall);
  backing.position.set(w.center[0], w.center[1], -0.1);
  const panel = (map: MeshBasicMaterial['map'], name: string, z: number, opacity: number) => {
    const material = new MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false });
    material.color.setScalar(1.6);
    material.userData.owned = true;
    const mesh = new Mesh(new PlaneGeometry(w.width, w.height), material);
    mesh.name = name;
    mesh.position.set(w.center[0], w.center[1], z);
    return mesh;
  };
  const main = panel(content.led.main, 'led-main', 0.01, 1);
  const highlight = panel(content.led.highlight, 'led-highlight', 0.012, 0);
  scene.add(backing, main, highlight);
  addVisitors(scene, w.visitors, mats);
  const d = span.end - span.start;
  return {
    ids,
    scene,
    dark: true,
    update(t) {
      const h = smoothstep(span.start + 0.6 * d, span.start + 0.75 * d, t);
      (highlight.material as MeshBasicMaterial).opacity = h;
      (main.material as MeshBasicMaterial).opacity = 1 - 0.85 * h;
    },
    dispose: () => disposeScene(scene),
  };
}
