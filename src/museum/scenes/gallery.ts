import { BoxGeometry, Group, Mesh } from 'three';
import type { TextLine } from '../../assets/texture-factory';
import { truncate } from '../../util/format';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto, createGlow, placeOnWall } from '../frame';
import { createTextPlane } from '../text-plane';

export function buildGallery({ layout, content, tex, mats }: SceneContext): SceneObject {
  const group = new Group();
  for (const stop of layout.galleryStops) {
    for (const slot of stop.slots) group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
    const normal = stop.slots[0].normal;
    group.add(createGlow(mats, [stop.center[0], stop.center[1] + 0.5, stop.center[2]], normal, stop.width * 1.4, 3));

    const numbers = stop.photoIndices.map((i) => String(i + 1).padStart(2, '0'));
    const label = numbers.length === 1 ? `No. ${numbers[0]}` : `No. ${numbers[0]}–${numbers[numbers.length - 1]}`;
    const captionLines: TextLine[] = stop.photoIndices
      .map((i) => content.captions[i] ?? '')
      .filter((c) => c.trim() !== '')
      .map((c) => ({ text: truncate(c, 24), px: 30, weight: 300 }));
    const text = tex.text({
      lines: [{ text: label, px: 34, weight: 500, spacing: 2 }, ...captionLines],
      background: '#ffffff',
      padding: 30,
      align: 'left',
    });
    const backing = new Mesh(new BoxGeometry(stop.plaque.width + 0.03, stop.plaque.height + 0.03, 0.02), mats.mat);
    placeOnWall(backing, stop.plaque, 0.01);
    const face = createTextPlane(text, stop.plaque.width, stop.plaque.height);
    placeOnWall(face, stop.plaque, 0.021);
    group.add(backing, face);
  }
  return { group };
}
