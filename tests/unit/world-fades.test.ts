import { describe, expect, it } from 'vitest';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import { dofScaleAt, worldFadeAt } from '../../src/render/world-fades';

describe('worldFadeAt', () => {
  const s = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
  const photos = requireSegment(s, 'photos');
  const network = requireSegment(s, 'network');
  const ending = requireSegment(s, 'ending');

  it('opens from black and is clear through the one-take walk', () => {
    expect(worldFadeAt(s, 0)).toEqual({ white: false, amount: 1 });
    expect(worldFadeAt(s, 1.0).amount).toBe(0);
    for (let t = 1.0; t < network.end - 3; t += 0.25) expect(worldFadeAt(s, t).amount, `t=${t}`).toBe(0);
    expect(worldFadeAt(s, (photos.start + photos.end) / 2).amount).toBe(0);
  });

  it('fades the network out to black, hides the cut to the card and fades the card in', () => {
    expect(worldFadeAt(s, network.end - 1e-6).amount).toBeCloseTo(1, 5);
    expect(worldFadeAt(s, ending.start).amount).toBe(1);
    expect(worldFadeAt(s, ending.start + 1.2).amount).toBe(0);
    expect(worldFadeAt(s, s.total)).toEqual({ white: false, amount: 1 });
  });

  it('never flashes white', () => {
    for (let t = 0; t <= s.total; t += 0.5) expect(worldFadeAt(s, t).white).toBe(false);
  });

  it('fades out the mosaic when the cut has no network', () => {
    const short = buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null });
    const mosaic = requireSegment(short, 'mosaic');
    expect(worldFadeAt(short, mosaic.end - 1e-6).amount).toBeCloseTo(1, 5);
    expect(worldFadeAt(short, (mosaic.start + mosaic.end) / 2).amount).toBe(0);
  });

  it('keeps the floating photos in the robot room sharp: weak depth of field there', () => {
    const robots = requireSegment(s, 'robots');
    const dive = requireSegment(s, 'dive');
    for (let t = robots.start + 3; t < dive.start; t += 0.5) expect(dofScaleAt(s, t)).toBeLessThanOrEqual(0.6);
  });

  it('keeps the hall walls readable behind the thumb: weak depth of field from Likes to the robot room', () => {
    const likes = requireSegment(s, 'likes');
    const robots = requireSegment(s, 'robots');
    for (let t = likes.start; t < robots.start; t += 0.5) expect(dofScaleAt(s, t), `t=${t}`).toBeLessThanOrEqual(0.4);
  });

  it('keeps the network sharp: depth of field fades out as the network grows, without a jump', () => {
    const start = network.start;
    expect(dofScaleAt(s, 30)).toBe(1.5);
    expect(dofScaleAt(s, start + 0.3 * (network.end - start))).toBeLessThanOrEqual(0.3);
    for (let t = 0; t < s.total; t += 1 / 30) expect(Math.abs(dofScaleAt(s, t + 1 / 30) - dofScaleAt(s, t))).toBeLessThan(0.05);
  });
});
