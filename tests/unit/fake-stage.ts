import { Texture } from 'three';
import type { StageTextureFactory } from '../../src/assets/texture-factory';
import { buildStoryboard } from '../../src/plan/storyboard';
import type { SetContext, StageContent } from '../../src/stage/context';
import { MOSAIC, computeStageLayout } from '../../src/stage/layout';
import { createStageMaterials } from '../../src/stage/parts/materials';
import type { LengthMode } from '../../src/types';
import { fakeLibrary } from './fake-library';

export function fakeTextures(aspect = 4): StageTextureFactory {
  return {
    text: () => ({ texture: new Texture(), aspect }),
    glow: () => new Texture(),
    lightbox: () => new Texture(),
    colorBars: () => new Texture(),
  };
}

export function fakeContext(n = 12, lengthMode: LengthMode = 'auto', opts: { aspects?: number[]; hires?: boolean; textAspect?: number } = {}): SetContext {
  const aspects = opts.aspects ?? Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const storyboard = buildStoryboard({ photoCount: n, lengthMode, musicDuration: null });
  const layout = computeStageLayout({ storyboard, aspects, portraitIndex: 1 % n, seed: 3 });
  const library = fakeLibrary(n, aspects, opts.hires === false ? [] : layout.featured);
  const cells = MOSAIC.cols * MOSAIC.rows;
  const content: StageContent = {
    library,
    name: 'Tim Sparke',
    subtitle: '2026',
    stamp: '08:06:55 AM Monday November 28, 2011',
    dateLabel: '2011.11.28',
    captions: aspects.map((_, i) => `caption ${i}`),
    led: { main: new Texture(), highlight: new Texture() },
    mosaic: { colors: new Float32Array(cells * 3).fill(0.5), assignment: new Int32Array(cells).map((_, i) => i % n) },
  };
  return { storyboard, layout, content, tex: fakeTextures(opts.textAspect), mats: createStageMaterials() };
}
