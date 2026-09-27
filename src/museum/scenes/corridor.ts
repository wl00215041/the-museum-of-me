import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto } from '../frame';

export function buildCorridor({ layout, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  for (const slot of layout.corridorSlots) group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
  return { group };
}
