import { BufferGeometry, Group, Line, Vector3 } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createTextPlane } from '../text-plane';

export function buildKeywords({ layout, room, tex, mats }: SceneContext): SceneObject {
  const group = new Group();
  group.name = 'keywords';
  const holders = layout.keywords.map((item) => {
    const holder = new Group();
    holder.position.set(...item.center);
    const text = tex.text({ lines: [{ text: item.text, px: 96, weight: 500, spacing: 2 }], color: '#232326', padding: 12 });
    holder.add(createTextPlane(text, Infinity, item.height));
    const thread = new Line(
      new BufferGeometry().setFromPoints([new Vector3(0, item.height / 2, 0), new Vector3(0, room.height - item.center[1], 0)]),
      mats.thread,
    );
    holder.add(thread);
    group.add(holder);
    return holder;
  });
  return {
    group,
    update: (t) => holders.forEach((h, i) => { h.rotation.y = 0.1 * Math.sin(0.5 * t + i * 1.7); }),
  };
}
