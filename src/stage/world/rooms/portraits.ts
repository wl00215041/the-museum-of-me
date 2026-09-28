import { Group } from 'three';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { addVisitors, createLabel } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

export function buildPortraitsRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats } = ctx;
  const p = strip.portraits;
  if (!p) return null;
  const group = new Group();
  group.name = 'room:portraits';
  group.add(createLabel(tex, p.label, mats));
  for (const item of p.items) {
    const block = createCanvasBlock(hiresOf(content, item.photoIndex), content.library.aspects[item.photoIndex], item.width, item.height, mats.blockSide);
    block.name = 'portrait-block';
    block.position.set(item.center[0], item.center[1], BLOCK_DEPTH / 2);
    group.add(block);
  }
  addVisitors(group, p.visitors, mats);
  return { group };
}
