import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight } from 'three';
import type { ImageLike } from '../../../assets/texture-factory';
import { placeIn } from '../../frame';
import { addVisitors } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

/** Location: three tall light boxes on the shallow dark wall (original 55–66 s); the faces use the v2 captions. */
export function buildLocationRoom(ctx: GalleryContext): RoomObject | null {
  const { gallery, content, tex, mats } = ctx;
  const loc = gallery.location;
  if (!loc) return null;
  const group = placeIn(loc.frame, new Group());
  group.name = 'room:location';
  loc.boxes.forEach((box, i) => {
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
  addVisitors(group, loc.visitors, mats);
  return { group };
}
