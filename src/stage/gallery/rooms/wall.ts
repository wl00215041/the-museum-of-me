import { Group } from 'three';
import { placeIn } from '../../frame';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { createTextPlane } from '../../parts/text-plane';
import { INK } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

/** Greedy word wrap to lines of at most `width` characters. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildWallRoom(ctx: GalleryContext): RoomObject {
  const { gallery, content, tex, mats } = ctx;
  const w = gallery.wall;
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

  const sentence = `This exhibition is a journey of visualization that explores who ${content.name} is.`;
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

  if (w.blockText) {
    const b = w.blockText;
    const text = createTextPlane(
      tex.text({ align: 'left', color: '#3a3a3a', lineGap: 0.6, padding: 12, lines: wrap(sentence, 24).map((line) => ({ text: line, px: 30, weight: 500 })) }),
      b.width,
      b.height,
    );
    text.name = 'block-text';
    text.position.set(b.center[0], b.center[1], b.center[2]);
    const holder = placeIn(b.frame, new Group());
    holder.add(text);
    group.add(holder);
  }
  return { group };
}
