import { Group } from 'three';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { createTextPlane } from '../../parts/text-plane';
import { INK } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

export function buildWallRoom(ctx: WorldContext): RoomObject {
  const { strip, content, tex, mats } = ctx;
  const w = strip.wall;
  const group = new Group();
  group.name = 'room:wall';

  const title = createTextPlane(
    tex.text({
      color: INK,
      lineGap: 0.15,
      padding: 20,
      lines: [
        { text: 'The Museum of Me', px: 120, weight: 700, family: 'serif' },
        { text: 'Create and explore a visual archive of your social life.', px: 38, weight: 700 },
      ],
    }),
    w.title.width,
    w.title.height,
  );
  title.name = 'title';
  title.position.set(w.title.center[0], w.title.center[1], 0.01);

  const exhibition = createTextPlane(
    tex.text({
      align: 'left',
      color: INK,
      lineGap: 0.04,
      padding: 20,
      lines: [
        { text: content.name.toUpperCase(), px: 200, weight: 800, family: 'grotesk' },
        { text: 'EXHIBITION', px: 200, weight: 800, family: 'grotesk' },
        { text: content.stamp, px: 64, weight: 800, family: 'grotesk' },
      ],
    }),
    w.exhibition.width,
    w.exhibition.height,
  );
  exhibition.name = 'exhibition';
  exhibition.position.set(w.exhibition.center[0], w.exhibition.center[1], 0.01);
  group.add(title, exhibition);

  if (w.intro) {
    const { avatar } = w.intro;
    const block = createCanvasBlock(hiresOf(content, avatar.photoIndex), content.library.aspects[avatar.photoIndex], avatar.width, avatar.height, mats.blockSide);
    block.name = 'intro-avatar';
    block.position.set(avatar.center[0], avatar.center[1], BLOCK_DEPTH / 2);
    const intro = createTextPlane(
      tex.text({
        align: 'left',
        color: INK,
        lineGap: 0.3,
        padding: 16,
        lines: [
          { text: 'This exhibition is a journey of', px: 64, weight: 700, family: 'serif' },
          { text: `visualization that explores who ${content.name} is.`, px: 64, weight: 700, family: 'serif' },
        ],
      }),
      w.intro.width,
      w.intro.height,
    );
    intro.name = 'intro';
    intro.position.set(w.intro.center[0], w.intro.center[1], 0.01);
    group.add(block, intro);
  }
  return { group };
}
