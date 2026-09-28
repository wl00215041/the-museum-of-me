import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight } from 'three';
import { cellTextureCropped } from '../../parts/atlas-mesh';
import { createThumbSculpture } from '../../parts/thumb';
import { addVisitors, createLabel } from '../common';
import type { RoomObject, WorldContext } from '../context';

export function buildLikesRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats } = ctx;
  const l = strip.likes;
  if (!l) return null;
  const group = new Group();
  group.name = 'room:likes';
  group.add(createLabel(tex, l.label, mats));
  const [sx, , sz] = l.sculpture;
  const pedestal = new Mesh(new CylinderGeometry(1.7, 1.8, 0.55, 48), mats.pedestal);
  pedestal.position.set(sx, 0.275, sz);
  const thumb = createThumbSculpture(mats.sculpture, 7);
  thumb.position.set(sx, 0.55, sz);
  thumb.rotation.y = -0.35;
  const spot = new SpotLight(0xffffff, 160, 20, 0.5, 0.6, 1.5);
  spot.position.set(sx + 1.5, 9, sz + 3);
  spot.target.position.set(sx, 1.5, sz);
  group.add(pedestal, thumb, spot, spot.target);

  const barsMaterial = new MeshBasicMaterial({ map: tex.colorBars() });
  barsMaterial.color.setScalar(0.75);
  barsMaterial.userData.owned = true;
  barsMaterial.userData.ownsMap = true;
  for (const monitor of l.monitors) {
    const body = new Mesh(new BoxGeometry(monitor.width + 0.06, monitor.height + 0.06, 0.08), mats.monitorBody);
    body.position.set(monitor.center[0], monitor.center[1], monitor.center[2] - 0.03);
    let material = barsMaterial;
    if (!monitor.bars) {
      material = new MeshBasicMaterial({ map: cellTextureCropped(content.library, monitor.photoIndex, monitor.width / monitor.height) });
      material.color.setScalar(0.75);
      material.userData.owned = true;
      material.userData.ownsMap = true;
    }
    const screen = new Mesh(new PlaneGeometry(monitor.width, monitor.height), material);
    screen.name = 'screen';
    screen.position.set(monitor.center[0], monitor.center[1], monitor.center[2] + 0.011);
    group.add(body, screen);
    if (monitor.center[2] > 0.5) {
      const pole = new Mesh(new CylinderGeometry(0.03, 0.03, monitor.center[1], 12), mats.monitorBody);
      pole.position.set(monitor.center[0], monitor.center[1] / 2, monitor.center[2] - 0.05);
      group.add(pole);
    }
  }
  addVisitors(group, l.visitors, mats);
  return { group };
}
