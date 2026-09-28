import { Texture } from 'three';
import type { StageTextureFactory } from '../../src/assets/texture-factory';
import { buildSequence } from '../../src/plan/sequence';
import { createStageMaterials } from '../../src/stage/parts/materials';
import { CARPET, computeStrip } from '../../src/stage/strip';
import type { WorldContent, WorldContext } from '../../src/stage/world/context';
import type { LengthMode } from '../../src/types';
import { fakeLibrary } from './fake-library';

export function fakeWorldTextures(aspect = 4): StageTextureFactory {
  return {
    text: () => ({ texture: new Texture(), aspect }),
    glow: () => new Texture(),
    lightbox: () => new Texture(),
    colorBars: () => new Texture(),
    concrete: () => new Texture(),
  };
}

export function fakeWorldContext(n = 12, lengthMode: LengthMode = 'auto', opts: { textAspect?: number; hires?: boolean } = {}): WorldContext {
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const sequence = buildSequence({ photoCount: n, lengthMode, musicDuration: null });
  const strip = computeStrip({ sequence, aspects, portraitIndex: 1 % n, seed: 3 });
  const library = fakeLibrary(n, aspects, opts.hires === false ? [] : strip.featured);
  const cells = CARPET.cols * CARPET.rows;
  const content: WorldContent = {
    library,
    name: 'Tim Sparke',
    subtitle: '2026',
    stamp: '08:06:55 AM Monday November 28, 2011',
    dateLabel: '2011.11.28',
    captions: aspects.map((_, i) => `caption ${i}`),
    led: { main: new Texture(), highlight: new Texture() },
    mosaic: { colors: new Float32Array(cells * 3).fill(0.5), assignment: new Int32Array(cells).map((_, i) => (i * 7) % n) },
  };
  return { sequence, strip, content, tex: fakeWorldTextures(opts.textAspect), mats: createStageMaterials() };
}
