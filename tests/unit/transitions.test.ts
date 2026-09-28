import { describe, expect, it } from 'vitest';
import { buildStoryboard } from '../../src/plan/storyboard';
import { GradeEffect, LETTERBOX_HALF } from '../../src/render/grade-effect';
import { DIP, ENTRY, fadeAt } from '../../src/render/transitions';
import type { ShotId } from '../../src/types';

const sb = buildStoryboard({ photoCount: 12, lengthMode: 'auto', musicDuration: null });
const start = (id: ShotId) => sb.shots.find((s) => s.id === id)!.start;

describe('fadeAt', () => {
  it('opens from white', () => {
    expect(fadeAt(sb, 0)).toEqual({ white: true, amount: 1 });
  });

  it('dips to black into dark rooms, the mosaic and the ending, and to white into the robots', () => {
    expect(fadeAt(sb, start('moments'))).toEqual({ white: false, amount: 1 });
    expect(fadeAt(sb, start('robots'))).toEqual({ white: true, amount: 1 });
    expect(fadeAt(sb, start('mosaic'))).toEqual({ white: false, amount: 1 });
    expect(fadeAt(sb, start('ending'))).toEqual({ white: false, amount: 1 });
  });

  it('cuts between dark rooms and continues along the wall', () => {
    expect(fadeAt(sb, start('words')).amount).toBe(0);
    expect(fadeAt(sb, start('exhibition')).amount).toBe(0);
  });

  it('is clear mid-shot and ends on black', () => {
    const likes = sb.shots.find((s) => s.id === 'likes')!;
    expect(fadeAt(sb, (likes.start + likes.end) / 2).amount).toBe(0);
    expect(fadeAt(sb, sb.total)).toEqual({ white: false, amount: 1 });
  });

  it('dips over DIP seconds either side of the cut', () => {
    const b = start('moments');
    expect(fadeAt(sb, b - DIP).amount).toBe(0);
    expect(fadeAt(sb, b + DIP / 2).amount).toBeCloseTo(0.5, 9);
  });

  it('defines an entry for every shot', () => {
    expect(Object.keys(ENTRY)).toHaveLength(13);
  });
});

describe('GradeEffect', () => {
  it('letterboxes to 2.35:1 inside 16:9', () => {
    expect(LETTERBOX_HALF * 2).toBeCloseTo(16 / 9 / 2.35, 12);
  });

  it('writes the fade colour, amount and letterbox uniforms', () => {
    const grade = new GradeEffect();
    grade.setState({ white: true, amount: 0.4 }, 10);
    expect(grade.uniforms.get('fadeAmount')!.value).toBe(0.4);
    expect(grade.uniforms.get('fadeColor')!.value.x).toBe(1);
    grade.setState({ white: false, amount: 1 }, 11);
    expect(grade.uniforms.get('fadeColor')!.value.x).toBe(0);
    expect(grade.uniforms.get('letterbox')!.value).toBeCloseTo(LETTERBOX_HALF, 12);
  });
});
