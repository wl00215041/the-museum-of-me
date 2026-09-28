import { InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildStage } from '../../src/stage/build';
import { MOSAIC, ROBOT_TILES } from '../../src/stage/layout';
import { fakeContext } from './fake-stage';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const instances = (root: Object3D, name: string) => (named(root, name) as InstancedMesh[]).reduce((s, m) => s + m.count, 0);

function stageFor(n: number, mode: Parameters<typeof fakeContext>[1] = 'auto') {
  const ctx = fakeContext(n, mode);
  return { ctx, stage: buildStage(ctx.storyboard, ctx.layout, ctx.content, ctx.tex) };
}

describe('buildStage', () => {
  it('builds the wall set plus one set per remaining shot', () => {
    const { stage } = stageFor(12);
    expect(stage.sets.map((s) => s.ids)).toEqual([
      ['title', 'intro', 'exhibition', 'portraits', 'photos'],
      ['moments'], ['words'], ['likes'], ['videos'], ['robots'], ['mosaic'], ['network'], ['ending'],
    ]);
    expect(stage.setFor('intro')).toBe(stage.setFor('title'));
    expect(stage.sets.map((s) => s.dark)).toEqual([false, true, true, true, true, false, true, true, true]);
  });

  it('the 30 s cut builds only its sets', () => {
    const { stage } = stageFor(12, 30);
    expect(stage.sets.map((s) => s.ids)).toEqual([['title', 'exhibition', 'photos'], ['mosaic'], ['ending']]);
    expect(() => stage.setFor('robots')).toThrow();
  });

  it('robots: tiles carpet the platform, photos float and four arms move', () => {
    const { ctx, stage } = stageFor(40);
    const set = stage.setFor('robots');
    expect(instances(set.scene, 'photo-tiles')).toBe(ROBOT_TILES.cols * ROBOT_TILES.rows);
    expect(instances(set.scene, 'floaters')).toBe(ctx.layout.robots.floaters.length);
    const arms = named(set.scene, 'robot-arm');
    expect(arms).toHaveLength(4);
    const span = ctx.storyboard.shots.find((s) => s.id === 'robots')!;
    const gripper = () => { set.scene.updateMatrixWorld(true); return arms[0].getObjectByName('gripper')!.getWorldPosition(new Vector3()).toArray(); };
    set.update(span.start + 1);
    const a = gripper();
    set.update(span.start + 5);
    expect(gripper()).not.toEqual(a);
    set.update(span.start + 1);
    expect(gripper()).toEqual(a);
    const floaters = named(set.scene, 'floaters')[0] as InstancedMesh;
    const m = new Matrix4();
    floaters.getMatrixAt(0, m);
    const before = m.elements[13];
    set.update(span.start + 3);
    floaters.getMatrixAt(0, m);
    expect(m.elements[13]).not.toBe(before);
  });

  it('mosaic: one tile per cell, then shrinks and fades to the portrait', () => {
    const { ctx, stage } = stageFor(12);
    const set = stage.setFor('mosaic');
    expect(instances(set.scene, 'mosaic-tiles')).toBe(MOSAIC.cols * MOSAIC.rows);
    const span = ctx.storyboard.shots.find((s) => s.id === 'mosaic')!;
    const overlay = named(set.scene, 'mosaic-overlay')[0] as Mesh<never, MeshBasicMaterial>;
    const group = named(set.scene, 'mosaic')[0];
    set.update(span.start);
    expect(overlay.material.opacity).toBe(0);
    expect(group.scale.x).toBe(1);
    set.update(span.end);
    expect(overlay.material.opacity).toBe(1);
    expect(group.scale.x).toBeCloseTo(0.35, 9);
  });

  it('network: photo spheres, stars and a slow rotation', () => {
    const { ctx, stage } = stageFor(30);
    const set = stage.setFor('network');
    expect(instances(set.scene, 'network-nodes')).toBe(ctx.layout.network.nodes.length);
    expect(named(set.scene, 'stars')).toHaveLength(1);
    const span = ctx.storyboard.shots.find((s) => s.id === 'network')!;
    const group = named(set.scene, 'network')[0];
    set.update(span.start);
    expect(group.rotation.y).toBe(0);
    set.update(span.start + 10);
    expect(group.rotation.y).toBeCloseTo(0.6, 9);
  });

  it('updates every set at any time without throwing, then disposes', () => {
    const { ctx, stage } = stageFor(8);
    for (let t = 0; t <= ctx.storyboard.total; t += 1.3) for (const set of stage.sets) set.update(t);
    expect(() => stage.dispose()).not.toThrow();
  });
});
