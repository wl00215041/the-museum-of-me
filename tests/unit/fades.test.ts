import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { INTRO_FADE, fadesAt } from '../../src/render/fades';
import { FinishEffect } from '../../src/render/finish-effect';

describe('fadesAt', () => {
  it('starts fully white and clears after the intro', () => {
    expect(fadesAt(0, 60)).toEqual({ white: 1, card: 0 });
    expect(fadesAt(INTRO_FADE, 60).white).toBe(0);
    expect(fadesAt(30, 60)).toEqual({ white: 0, card: 0 });
  });

  it('ends on white with the end card fully shown', () => {
    expect(fadesAt(60, 60)).toEqual({ white: 1, card: 1 });
  });

  it('is almost white before the card starts to appear', () => {
    const f = fadesAt(60 - 2.4, 60);
    expect(f.white).toBeGreaterThan(0.9);
    expect(f.card).toBe(0);
  });

  it('never decreases during the outro', () => {
    let prev = 0;
    for (let t = 55; t <= 60; t += 0.1) {
      const { white } = fadesAt(t, 60);
      expect(white).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = white;
    }
  });
});

describe('FinishEffect', () => {
  it('writes fade, card and grain seed uniforms', () => {
    const effect = new FinishEffect(new Texture());
    effect.setState(0.25, 0.75, 12);
    expect(effect.uniforms.get('white')!.value).toBe(0.25);
    expect(effect.uniforms.get('cardOpacity')!.value).toBe(0.75);
    expect(effect.uniforms.get('seed')!.value).toBeCloseTo(12 * 1.618, 9);
  });
});
