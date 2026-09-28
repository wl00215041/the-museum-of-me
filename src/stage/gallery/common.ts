import { BoxGeometry, Group, Mesh } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import { placeIn } from '../frame';
import type { Label } from '../gallery';
import type { VisitorSpot } from '../placement';
import type { StageMaterials } from '../parts/materials';
import { createTextPlane } from '../parts/text-plane';
import { createVisitor } from '../parts/visitor';
import type { GalleryContext } from './context';

/** Wall lettering: solid near-black, as printed vinyl in the original. */
export const INK = '#141414';
/** The original's section signs: the name is about 0.56 m wide at the Friends wall. */
export const LABEL_SIZE = { width: 0.95, height: 1.15 } as const;

const BLURBS: Record<string, string> = {
  Friends: 'The faces in this collection.',
  Photos: 'Moments worth keeping.',
  Location: 'Where and when.',
  Words: 'The words you use most.',
  Likes: 'Things you love.',
  Videos: 'Moving pictures.',
};

/** Section sign: icon, name, one line of description and the number (dark rooms use white lettering). */
export function createLabel(tex: StageTextureFactory, label: Label, mats: StageMaterials): Group {
  const outer = placeIn(label.frame, new Group());
  outer.name = `label:${label.text}`;
  const inner = new Group();
  inner.position.set(label.at[0], label.at[1], label.at[2]);
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
    LABEL_SIZE.width,
    LABEL_SIZE.height,
  );
  text.position.z = 0.016;
  inner.add(text);
  if (!label.dark) {
    const backing = new Mesh(new BoxGeometry(LABEL_SIZE.width + 0.04, LABEL_SIZE.height + 0.04, 0.015), mats.plaque);
    backing.position.z = 0.0075;
    inner.add(backing);
  }
  outer.add(inner);
  return outer;
}

export function buildLabels(ctx: GalleryContext): Group {
  const group = new Group();
  group.name = 'labels';
  for (const label of ctx.gallery.labels) group.add(createLabel(ctx.tex, label, ctx.mats));
  return group;
}

export function addVisitors(group: Group, spots: VisitorSpot[], mats: StageMaterials): void {
  for (const s of spots) group.add(createVisitor(s, mats.visitor));
}
