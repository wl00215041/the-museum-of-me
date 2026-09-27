import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { placeOnWall } from '../frame';
import { createTextPlane } from '../text-plane';

export function buildOpening({ layout, content, tex }: SceneContext): SceneObject {
  const group = new Group();
  const text = tex.text({
    lines: [
      { text: 'THE MUSEUM OF', px: 64, weight: 300, spacing: 18 },
      { text: content.name, px: 150, weight: 700, spacing: 6 },
      { text: content.subtitle, px: 52, weight: 300, spacing: 8 },
    ],
  });
  const title = createTextPlane(text, layout.title.width, layout.title.height);
  title.name = 'title';
  placeOnWall(title, layout.title, 0.01);
  group.add(title);
  return { group };
}
