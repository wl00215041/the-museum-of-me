import { Group } from 'three';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { addVisitors } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

/** Friends: square canvases in a row at eye height (original 26–37 s). */
export function buildPortraitsRoom(ctx: GalleryContext): RoomObject | null {
  const { gallery, content, mats } = ctx;
  const p = gallery.portraits;
  if (!p) return null;
  const group = new Group();
  group.name = 'room:portraits';
  for (const item of p.items) {
    const block = createCanvasBlock(hiresOf(content, item.photoIndex), content.library.aspects[item.photoIndex], item.width, item.height, mats.blockSide);
    block.name = 'portrait-block';
    block.position.set(item.center[0], item.center[1], BLOCK_DEPTH / 2);
    group.add(block);
  }
  addVisitors(group, p.visitors, mats);
  return { group };
}
