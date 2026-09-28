import { Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { findSegment, requireSegment } from '../../src/plan/sequence';
import { CARPET } from '../../src/stage/strip';
import { buildFinale } from '../../src/stage/world/finale';
import { buildRobotsRoom } from '../../src/stage/world/rooms/robots';
import { buildWorld } from '../../src/stage/world/world';
import { fakeWorldContext } from './fake-world';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const count = (root: Object3D, name: string) => (named(root, name) as InstancedMesh[]).reduce((s, m) => s + m.count, 0);

describe('robots room', () => {
  it('has five arms and the floating photos, and the arms move with time', () => {
    const ctx = fakeWorldContext(20);
    const room = buildRobotsRoom(ctx);
    const arms = named(room.group, 'robot-arm');
    expect(arms).toHaveLength(5);
    expect(count(room.group, 'floaters')).toBe(ctx.strip.robots.floaters.length);
    const grip = () => { room.group.updateMatrixWorld(true); return arms[0].getObjectByName('gripper')!.getWorldPosition(new Vector3()).toArray(); };
    room.update!(10);
    const a = grip();
    room.update!(14);
    expect(grip()).not.toEqual(a);
  });
});

describe('finale', () => {
  it('the carpet has one tile per mosaic cell and spans atlases for large libraries', () => {
    expect(count(buildFinale(fakeWorldContext(20)).group, 'carpet-tiles')).toBe(CARPET.cols * CARPET.rows);
    expect(named(buildFinale(fakeWorldContext(300)).group, 'carpet-tiles')).toHaveLength(2);
  });

  it('blacks out the room during the end of the dive', () => {
    const ctx = fakeWorldContext(20);
    const finale = buildFinale(ctx);
    const dive = requireSegment(ctx.sequence, 'dive');
    const d = dive.end - dive.start;
    expect(finale.blackoutAt(dive.start + 0.5 * d)).toBe(0);
    expect(finale.blackoutAt(dive.end)).toBe(1);
    finale.update!(dive.start + 0.8 * d);
    const [blackout] = named(finale.group, 'blackout') as Mesh<never, MeshBasicMaterial>[];
    expect(blackout.visible).toBe(true);
    expect(blackout.material.opacity).toBeGreaterThan(0);
  });

  it('lifts, tints and shrinks the carpet into the portrait during the mosaic', () => {
    const ctx = fakeWorldContext(20);
    const finale = buildFinale(ctx);
    const mosaic = requireSegment(ctx.sequence, 'mosaic');
    const [carpet] = named(finale.group, 'carpet');
    const [tiles] = named(finale.group, 'carpet-tiles') as InstancedMesh[];
    const [overlay] = named(finale.group, 'mosaic-overlay') as Mesh<never, MeshBasicMaterial>[];
    const c = new Color();
    finale.update!(mosaic.start);
    expect(carpet.position.toArray()).toEqual(ctx.strip.finale.carpet);
    tiles.getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
    expect(overlay.material.opacity).toBe(0);
    finale.update!(mosaic.end - 1e-6);
    carpet.position.toArray().forEach((v, i) => expect(v).toBeCloseTo(ctx.strip.finale.lifted[i], 3));
    expect(carpet.scale.x).toBeCloseTo(0.3, 3);
    expect(overlay.material.opacity).toBeCloseTo(1, 3);
    tiles.getColorAt(0, c);
    expect(c.r).not.toBe(1);
  });

  it('grows the network from the portrait sphere outwards', () => {
    const ctx = fakeWorldContext(30);
    const finale = buildFinale(ctx);
    const network = findSegment(ctx.sequence, 'network')!;
    const [group] = named(finale.group, 'network');
    const [core] = named(finale.group, 'network-core');
    const [nodes] = named(finale.group, 'network-nodes') as InstancedMesh[];
    const m = new Matrix4();
    const scaleOf = (i: number) => { nodes.getMatrixAt(i, m); return new Vector3().setFromMatrixScale(m).x; };
    finale.update!(network.start);
    expect(group.visible).toBe(true);
    expect(core.scale.x).toBe(0);
    expect(scaleOf(0)).toBe(0);
    finale.update!(network.end - 1e-6);
    expect(core.scale.x).toBe(1);
    expect(scaleOf(0)).toBeGreaterThan(0.1);
    const [carpet] = named(finale.group, 'carpet');
    expect(carpet.visible).toBe(false);
  });

  it('fades the end card in', () => {
    const ctx = fakeWorldContext(12);
    const finale = buildFinale(ctx);
    const ending = requireSegment(ctx.sequence, 'ending');
    const [card] = named(finale.group, 'end-card') as Mesh<never, MeshBasicMaterial>[];
    finale.update!(ending.start);
    expect(card.material.opacity).toBe(0);
    finale.update!((ending.start + ending.end) / 2);
    expect(card.material.opacity).toBe(1);
  });
});

describe('buildWorld', () => {
  it('hides the rooms once the blackout is complete and blends bloom across boundaries', () => {
    const ctx = fakeWorldContext(20);
    const world = buildWorld(ctx.sequence, ctx.strip, ctx.content, ctx.tex);
    const [rooms] = named(world.scene, 'rooms');
    const dive = requireSegment(ctx.sequence, 'dive');
    world.update(dive.start);
    expect(rooms.visible).toBe(true);
    world.update(dive.end + 0.1);
    expect(rooms.visible).toBe(false);
    const b = ctx.strip.boundaries.find((x) => !x.left.dark && x.right.dark)!;
    expect(world.bloomAt(0, b.x - 3)).toBeCloseTo(0.2, 9);
    expect(world.bloomAt(0, b.x + 3)).toBeCloseTo(1.1, 9);
    expect(world.bloomAt(0, b.x)).toBeCloseTo(0.65, 9);
    expect(world.bloomAt(ctx.sequence.total, 0)).toBeCloseTo(0.25, 9);
  });

  it('updates at every time in every cut and disposes cleanly', () => {
    for (const mode of ['auto', 30, 60] as const) {
      const ctx = fakeWorldContext(8, mode);
      const world = buildWorld(ctx.sequence, ctx.strip, ctx.content, ctx.tex);
      for (let t = 0; t <= ctx.sequence.total; t += 0.7) world.update(t);
      expect(() => world.dispose()).not.toThrow();
    }
  });
});
