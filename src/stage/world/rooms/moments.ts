import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight } from 'three';
import type { ImageLike } from '../../../assets/texture-factory';
import { addVisitors, createLabel } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

export function buildMomentsRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats } = ctx;
  const m = strip.moments;
  if (!m) return null;
  const group = new Group();
  group.name = 'room:moments';
  group.add(createLabel(tex, m.label, mats));
  m.boxes.forEach((box, i) => {
    const face = tex.lightbox(hiresOf(content, box.photoIndex).image as ImageLike, [
      `NO. ${String(i + 1).padStart(3, '0')}`,
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
    group.add(frame, panel, light);
  });
  addVisitors(group, m.visitors, mats);
  return { group };
}
