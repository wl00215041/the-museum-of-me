import { BoxGeometry, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { CanvasItem } from '../../placement';
import { buildAtlasInstances } from '../../parts/atlas-mesh';
import { BLOCK_DEPTH } from '../../parts/canvas-block';
import { addVisitors } from '../common';
import type { GalleryContext, RoomObject } from '../context';

/** Photos: the swarm rising to the upper right, on the same wall as Friends (original 37–53 s). */
export function buildPhotosRoom(ctx: GalleryContext): RoomObject {
  const { gallery, content, mats } = ctx;
  const p = gallery.photos;
  const group = new Group();
  group.name = 'room:photos';
  const matrix = (item: CanvasItem) =>
    new Matrix4().compose(new Vector3(item.center[0], item.center[1], item.center[2] + BLOCK_DEPTH / 2), new Quaternion(), new Vector3(item.width, item.height, 1));
  for (const mesh of buildAtlasInstances({
    geometry: new BoxGeometry(1, 1, BLOCK_DEPTH),
    library: content.library,
    items: p.items.map((item) => ({ photoIndex: item.photoIndex, matrix: matrix(item) })),
    material: (atlas) => mats.atlas(content.library.atlases[atlas], true),
    rect: 'fit',
  })) {
    mesh.name = 'photo-swarm';
    group.add(mesh);
  }
  addVisitors(group, p.visitors, mats);
  return { group };
}
