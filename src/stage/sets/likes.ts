import { BoxGeometry, CylinderGeometry, HemisphereLight, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight } from 'three';
import type { ShotId } from '../../types';
import type { SetContext, StageSet } from '../context';
import { disposeScene } from '../dispose';
import { cellTextureCropped } from '../parts/atlas-mesh';
import { createThumbSculpture } from '../parts/thumb';
import { addDarkRoom, addVisitors, darkScene } from './common';

export function buildLikesSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats } = ctx;
  const scene = darkScene();
  // The monitor wall stands at z = -5, so the back wall goes behind it.
  addDarkRoom(scene, mats, 34, 18, -5.3);
  scene.add(new HemisphereLight(0x9a9a9a, 0x101010, 0.6));

  const pedestal = new Mesh(new CylinderGeometry(1.7, 1.8, 0.55, 48), mats.pedestal);
  pedestal.position.y = 0.275;
  const thumb = createThumbSculpture(mats.sculpture, 7);
  thumb.position.y = 0.55;
  thumb.rotation.y = -0.35;
  const spot = new SpotLight(0xffffff, 160, 20, 0.5, 0.6, 1.5);
  spot.position.set(1.5, 9, 3);
  spot.target.position.set(0, 1.5, 0);
  scene.add(pedestal, thumb, spot, spot.target);

  const barsMaterial = new MeshBasicMaterial({ map: tex.colorBars() });
  barsMaterial.color.setScalar(1.3);
  barsMaterial.userData.owned = true;
  barsMaterial.userData.ownsMap = true;
  for (const monitor of layout.likes.monitors) {
    const body = new Mesh(new BoxGeometry(monitor.width + 0.06, monitor.height + 0.06, 0.1), mats.monitorBody);
    body.position.set(monitor.center[0], monitor.center[1], monitor.center[2] + 0.05);
    let material = barsMaterial;
    if (!monitor.bars) {
      material = new MeshBasicMaterial({ map: cellTextureCropped(content.library, monitor.photoIndex, monitor.width / monitor.height) });
      material.color.setScalar(1.4);
      material.userData.owned = true;
      material.userData.ownsMap = true;
    }
    const screen = new Mesh(new PlaneGeometry(monitor.width, monitor.height), material);
    screen.name = 'screen';
    screen.position.set(monitor.center[0], monitor.center[1], monitor.center[2] + 0.101);
    scene.add(body, screen);
  }
  addVisitors(scene, layout.likes.visitors, mats);
  return { ids, scene, dark: true, update: () => {}, dispose: () => disposeScene(scene) };
}
