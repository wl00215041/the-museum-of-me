import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight } from 'three';
import type { ImageLike } from '../../assets/texture-factory';
import type { ShotId } from '../../types';
import { hiresOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { addDarkRoom, addVisitors, darkScene } from './common';

export function buildMomentsSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats } = ctx;
  const scene = darkScene();
  addDarkRoom(scene, mats, 34, 16);
  for (const box of layout.moments.boxes) {
    const photo = hiresOf(content, box.photoIndex);
    const face = tex.lightbox(photo.image as ImageLike, [
      `NO. ${String(box.photoIndex + 1).padStart(3, '0')}`,
      content.captions[box.photoIndex] ?? '',
      content.dateLabel,
    ]);
    const frame = new Mesh(new BoxGeometry(box.width + 0.06, box.height + 0.06, 0.18), mats.lightboxFrame);
    frame.position.set(box.center[0], box.center[1], 0.09);
    const material = new MeshBasicMaterial({ map: face });
    material.color.setScalar(1.35);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const panel = new Mesh(new PlaneGeometry(box.width, box.height), material);
    panel.name = 'lightbox';
    panel.position.set(box.center[0], box.center[1], 0.181);
    const light = new PointLight(0x9fc3ff, 3, 6, 2);
    light.position.set(box.center[0], 1.2, 1.2);
    scene.add(frame, panel, light);
  }
  addVisitors(scene, layout.moments.visitors, mats);
  return { ids, scene, dark: true, update: () => {}, dispose: () => disposeScene(scene) };
}
