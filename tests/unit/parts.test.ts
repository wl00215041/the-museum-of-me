import { Box3, BoxGeometry, MeshStandardMaterial, Texture, Vector3, type Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEPTH, createCanvasBlock, cropTexture } from '../../src/stage/parts/canvas-block';
import { createStageMaterials } from '../../src/stage/parts/materials';
import { armAngles, createRobotArm } from '../../src/stage/parts/robot-arm';
import { fitBox } from '../../src/stage/parts/text-plane';
import { createThumbSculpture } from '../../src/stage/parts/thumb';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../../src/stage/parts/characters';
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
  const make = (character: CharacterId, dark = false) => {
    const g = createVisitor({ pos: [0, 0, 0], yaw: 0, character, dark, scale: 1 }, mats.visitor);
    g.updateMatrixWorld(true);
    return g;
  };
  const part = (g: Object3D, name: string) => { const out: Object3D[] = []; g.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
  const box = (o: Object3D) => new Box3().setFromObject(o);
  const triangles = (g: Object3D) => {
    let n = 0;
    g.traverse((o) => { const geo = (o as Mesh).geometry; if (geo) n += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3; });
    return n;
  };

  it('every character stands 1.55–1.92 m tall on the floor, with a head, hair, torso, two arms and two legs', () => {
    for (const id of CHARACTER_IDS) {
      const g = make(id);
      const b = box(g);
      expect(b.max.y - b.min.y, CHARACTERS[id].name).toBeGreaterThan(1.55);
      expect(b.max.y - b.min.y, CHARACTERS[id].name).toBeLessThan(1.92);
      expect(b.min.y).toBeGreaterThan(-0.01);
      expect(b.min.y).toBeLessThan(0.02);
      for (const name of ['head', 'hair', 'torso', 'arm-l', 'arm-r', 'leg-l', 'leg-r']) expect(part(g, name).length, `${CHARACTERS[id].name} ${name}`).toBeGreaterThan(0);
      expect(triangles(g), CHARACTERS[id].name).toBeLessThan(8000);
    }
  });

  it('left and right limbs are mirrored: the character\'s left is +X', () => {
    const g = make('tshirt');
    expect(box(part(g, 'arm-l')[0]).getCenter(new Vector3()).x).toBeGreaterThan(0.1);
    expect(box(part(g, 'arm-r')[0]).getCenter(new Vector3()).x).toBeLessThan(-0.1);
    expect(box(part(g, 'leg-l')[0]).getCenter(new Vector3()).x).toBeGreaterThan(0);
    expect(box(part(g, 'leg-r')[0]).getCenter(new Vector3()).x).toBeLessThan(0);
  });

  it('shows each outfit\'s identifying features', () => {
    const ponytail = box(part(make('ponytail'), 'hair-ponytail')[0]);
    expect(ponytail.min.y).toBeLessThan(1.5);
    expect(ponytail.min.z).toBeLessThan(-0.08);
    const dress = make('dress');
    const skirt = box(part(dress, 'skirt')[0]);
    expect(skirt.max.x - skirt.min.x).toBeGreaterThan(0.5);
    expect(skirt.min.y).toBeGreaterThan(0.4);
    expect(part(dress, 'hair-bun')).toHaveLength(1);
    const heel = box(part(dress, 'shoe-l')[0]);
    expect(heel.max.y).toBeGreaterThan(0.06);
    const blazer = box(part(make('blazer'), 'blazer')[0]);
    expect(blazer.min.y).toBeLessThan(0.8);
    for (const id of ['whitetop', 'passer'] as const) expect(box(part(make(id), 'hair')[0]).min.y, id).toBeLessThan(1.45);
  });

  it('crossed arms bring both hands in front of the chest; arms down keep them at the thighs', () => {
    const crossed = make('ponytail');
    for (const side of ['l', 'r']) {
      const hand = box(part(crossed, `hand-${side}`)[0]).getCenter(new Vector3());
      expect(hand.y).toBeGreaterThan(1.05);
      expect(hand.z).toBeGreaterThan(0.08);
    }
    const down = make('tshirt');
    for (const side of ['l', 'r']) expect(box(part(down, `hand-${side}`)[0]).getCenter(new Vector3()).y).toBeLessThan(0.95);
  });

  it('dark visitors are silhouettes', () => {
    make('dress', true).traverse((o) => {
      if ('material' in o) expect(o.material).toBe(mats.visitor.silhouette);
    });
  });

  it('turns to its yaw and is deterministic', () => {
    const g = createVisitor({ pos: [1, 0, 2], yaw: Math.PI, character: 'blazer', dark: false, scale: 1 }, mats.visitor);
    expect(g.rotation.y).toBe(Math.PI);
    expect(triangles(make('blazer'))).toBe(triangles(make('blazer')));
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
