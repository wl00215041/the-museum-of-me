import { Box3, BoxGeometry, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEPTH, createCanvasBlock, cropTexture } from '../../src/stage/parts/canvas-block';
import { createStageMaterials } from '../../src/stage/parts/materials';
import { armAngles, createRobotArm } from '../../src/stage/parts/robot-arm';
import { fitBox } from '../../src/stage/parts/text-plane';
import { createThumbSculpture } from '../../src/stage/parts/thumb';
import { createVisitor } from '../../src/stage/parts/visitor';

const mats = createStageMaterials();

describe('canvas blocks', () => {
  it('crops wide and tall photos to the block aspect', () => {
    const wide = cropTexture(new Texture(), 2, 1);
    expect([wide.repeat.x, wide.repeat.y, wide.offset.x, wide.offset.y]).toEqual([0.5, 1, 0.25, 0]);
    const tall = cropTexture(new Texture(), 0.5, 1);
    expect([tall.repeat.x, tall.repeat.y, tall.offset.x, tall.offset.y]).toEqual([1, 0.5, 0, 0.25]);
  });

  it('builds a box with the photo on the front face only', () => {
    const texture = new Texture();
    const block = createCanvasBlock(texture, 1.5, 1.2, 0.8, mats.blockSide);
    const p = (block.geometry as BoxGeometry).parameters;
    expect([p.width, p.height, p.depth]).toEqual([1.2, 0.8, BLOCK_DEPTH]);
    const materials = block.material as MeshStandardMaterial[];
    expect(materials).toHaveLength(6);
    expect(materials[4].map).not.toBe(texture);
    expect(materials[4].map!.source).toBe(texture.source);
    expect(materials.filter((m) => m === mats.blockSide)).toHaveLength(5);
  });

  it('fitBox fits by the limiting side', () => {
    expect(fitBox(4, 8, 4)).toEqual({ width: 8, height: 2 });
    expect(fitBox(0.5, 8, 4)).toEqual({ width: 2, height: 4 });
  });
});

describe('visitors', () => {
  it('stand about 1.7–1.95 m tall in every pose and turn to their yaw', () => {
    for (const pose of [0, 1, 2] as const) {
      const g = createVisitor({ pos: [1, 0, 2], yaw: Math.PI, pose, dark: false, scale: 1 }, mats.visitor);
      g.updateMatrixWorld(true);
      const box = new Box3().setFromObject(g);
      expect(box.max.y - box.min.y).toBeGreaterThan(1.7);
      expect(box.max.y - box.min.y).toBeLessThan(1.95);
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(g.rotation.y).toBe(Math.PI);
    }
  });

  it('dark visitors are silhouettes', () => {
    const g = createVisitor({ pos: [0, 0, 0], yaw: 0, pose: 1, dark: true, scale: 1 }, mats.visitor);
    g.traverse((o) => {
      if ('material' in o) expect(o.material).toBe(mats.visitor.silhouette);
    });
  });
});

describe('sculpture and robots', () => {
  it('thumb sculpture is about 3 m tall and deterministic', () => {
    const a = createThumbSculpture(mats.sculpture, 4);
    const b = createThumbSculpture(mats.sculpture, 4);
    const box = new Box3().setFromObject(a);
    expect(box.max.y - box.min.y).toBeGreaterThan(2.8);
    expect(box.max.y - box.min.y).toBeLessThan(3.6);
    const pa = ((a.children[0] as never as { geometry: BoxGeometry }).geometry.getAttribute('position').array as Float32Array)[0];
    const pb = ((b.children[0] as never as { geometry: BoxGeometry }).geometry.getAttribute('position').array as Float32Array)[0];
    expect(pa).toBe(pb);
  });

  it('armAngles is deterministic and bounded', () => {
    expect(armAngles(3.2, 1.7)).toEqual(armAngles(3.2, 1.7));
    for (let t = 0; t < 60; t += 0.7) {
      const a = armAngles(t, 0.5);
      expect(a.grip).toBeGreaterThanOrEqual(0);
      expect(a.grip).toBeLessThanOrEqual(1);
      expect(Math.abs(a.base)).toBeLessThanOrEqual(0.55 + 1e-9);
    }
  });

  it('robot arms reach forward and stay above the floor', () => {
    const arm = createRobotArm(mats.robot);
    const p = new Vector3();
    for (let t = 0; t < 40; t += 0.5) {
      arm.pose(armAngles(t, 1.1));
      arm.group.updateMatrixWorld(true);
      arm.gripper.getWorldPosition(p);
      expect(p.z).toBeGreaterThan(1);
      expect(p.y).toBeGreaterThan(0.5);
      expect(p.y).toBeLessThan(3.4);
    }
  });
});
