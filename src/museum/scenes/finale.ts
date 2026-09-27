import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto, createGlow } from '../frame';
import { createVisitor } from '../visitor';

export function buildFinale({ layout, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  const slot = layout.finalePortrait;
  group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
  const [x, y, z] = slot.center;
  group.add(createGlow(mats, [x, y + slot.height * 0.2, z], slot.normal, slot.width * 1.8, slot.height * 1.6));
  const visitor = createVisitor(mats.visitor);
  visitor.position.set(...layout.visitor);
  visitor.rotation.y = Math.PI;
  group.add(visitor);
  return { group };
}
