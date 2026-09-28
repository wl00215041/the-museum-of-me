import { BoxGeometry, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { CanvasItem } from '../../placement';
import { buildAtlasInstances } from '../../parts/atlas-mesh';
import { BLOCK_DEPTH } from '../../parts/canvas-block';
import { addVisitors, createLabel } from '../common';
import type { RoomObject, WorldContext } from '../context';

export function buildPhotosRoom(ctx: WorldContext): RoomObject {
  const { strip, content, tex, mats } = ctx;
  const p = strip.photos;
  const group = new Group();
  group.name = 'room:photos';
  group.add(createLabel(tex, p.label, mats));
  const matrix = (item: CanvasItem) =>
    new Matrix4().compose(new Vector3(item.center[0], item.center[1], BLOCK_DEPTH / 2), new Quaternion(), new Vector3(item.width, item.height, 1));
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
