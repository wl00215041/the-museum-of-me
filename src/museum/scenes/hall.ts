import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto, createGlow } from '../frame';

export function buildHall({ layout, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  const slot = layout.hallPortrait;
  group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
  const [x, y, z] = slot.center;
  group.add(createGlow(mats, [x, y + slot.height * 0.25, z], slot.normal, slot.width * 1.9, slot.height * 1.7));
  return { group };
}
