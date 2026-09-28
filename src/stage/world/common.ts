import { BoxGeometry, Group, Mesh } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { VisitorSpot } from '../placement';
import type { StageMaterials } from '../parts/materials';
import { createTextPlane } from '../parts/text-plane';
import { createVisitor } from '../parts/visitor';
import type { Label } from '../strip';

/** Wall lettering: solid near-black, as printed vinyl in the original. */
export const INK = '#141414';

const BLURBS: Record<string, string> = {
  Portraits: 'The faces in this collection.',
  Photos: 'Moments worth keeping.',
  Moments: 'Where and when.',
  Words: 'The words you use most.',
  Likes: 'Things you love.',
  Videos: 'Moving pictures.',
};

/** Section label: icon, name, one line of description and the section number (dark rooms use white lettering). */
export function createLabel(tex: StageTextureFactory, label: Label, mats: StageMaterials): Group {
  const group = new Group();
  group.name = `label:${label.text}`;
  const color = label.dark ? '#e6e6e6' : '#262626';
  const text = createTextPlane(
    tex.text({
      size: { width: 420, height: 520 },
      align: 'left',
      padding: 36,
      color,
      lines: [
        { text: '■', px: 40, weight: 500 },
        { text: label.text, px: 44, weight: 800, family: 'grotesk' },
        { text: BLURBS[label.text] ?? '', px: 22, weight: 500 },
        { text: label.number, px: 36, weight: 500, family: 'grotesk' },
      ],
    }),
    0.42,
    0.52,
  );
  if (!label.dark) {
    const backing = new Mesh(new BoxGeometry(0.46, 0.56, 0.015), mats.plaque);
    backing.position.z = 0.0075;
    group.add(backing);
  }
  text.position.z = 0.016;
  group.add(text);
  group.position.set(...label.at);
  return group;
}

export function addVisitors(group: Group, spots: VisitorSpot[], mats: StageMaterials): void {
  for (const s of spots) group.add(createVisitor(s, mats.visitor));
}
