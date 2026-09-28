import { Box3, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createThumbSculpture } from '../../src/stage/parts/thumb';

describe('like sculpture', () => {
  const hand = createThumbSculpture(new MeshStandardMaterial(), 7);
  const box = new Box3().setFromObject(hand);
  const part = (name: string) => hand.children.filter((c) => c.name === name);

  it('has the original proportions: a long low hand, about 2.85 m tall and 3.9 m long, resting on y = 0', () => {
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(2.7);
    expect(box.max.y).toBeLessThan(2.95);
    expect(box.max.x - box.min.x).toBeGreaterThan(3.6);
    expect(box.max.x - box.min.x).toBeLessThan(4.2);
    expect(box.max.z - box.min.z).toBeLessThan(1.8);
  });

  it('is a back of the hand, an upright thumb and four curled fingers stacked on +x', () => {
    expect(part('hand-back')).toHaveLength(1);
    expect(part('hand-thumb').length).toBeGreaterThanOrEqual(2);
    const fingers = part('hand-finger');
    expect(fingers).toHaveLength(4);
    const tops = fingers.map((f) => new Box3().setFromObject(f).max.y);
    expect([...tops].sort((a, b) => b - a)).toEqual(tops);
    for (const f of fingers) expect(new Box3().setFromObject(f).max.x).toBeGreaterThan(1);
    const thumbTop = Math.max(...part('hand-thumb').map((t) => new Box3().setFromObject(t).max.y));
    expect(thumbTop).toBeCloseTo(box.max.y, 6);
    expect(tops[0]).toBeLessThan(thumbTop - 0.6);
  });

  it('is deterministic', () => {
    const again = new Box3().setFromObject(createThumbSculpture(new MeshStandardMaterial(), 7));
    expect(again.equals(box)).toBe(true);
  });
});
