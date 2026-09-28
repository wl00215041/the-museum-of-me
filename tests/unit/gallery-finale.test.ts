import { Color, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { findSegment, requireSegment } from '../../src/plan/sequence';
import { aoIntensityFor } from '../../src/render/world-fades';
import { CARPET } from '../../src/stage/gallery';
import { buildFinale } from '../../src/stage/gallery/finale';
import { buildRobotsRoom } from '../../src/stage/gallery/rooms/robots';
import { buildGalleryWorld } from '../../src/stage/gallery/world';
import type { LengthMode } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const count = (root: Object3D, name: string) => (named(root, name) as InstancedMesh[]).reduce((s, m) => s + m.count, 0);
const CUTS: { mode: LengthMode; music?: number }[] = [{ mode: 'auto' }, { mode: 30 }, { mode: 60 }, { mode: 90 }, { mode: 'music', music: 46 }, { mode: 'music', music: 300 }];

describe('robot room', () => {
  it('stands five moving arms and the floating photos in the robot frame', () => {
    const ctx = fakeGalleryContext(20);
    const room = buildRobotsRoom(ctx);
    expect(room.group.position.toArray()).toEqual(ctx.gallery.robots.frame.origin);
    const arms = named(room.group, 'robot-arm');
    expect(arms).toHaveLength(5);
    expect(count(room.group, 'floaters')).toBe(ctx.gallery.robots.floaters.length);
    const robots = requireSegment(ctx.sequence, 'robots');
    const grip = () => { room.group.updateMatrixWorld(true); return arms[0].getObjectByName('gripper')!.getWorldPosition(new Vector3()).toArray(); };
    room.update!(robots.start + 2);
    const a = grip();
    room.update!(robots.start + 6);
    expect(grip()).not.toEqual(a);
  });
});

describe('finale', () => {
  it('has one carpet tile per mosaic cell, across atlases for large libraries', () => {
    expect(count(buildFinale(fakeGalleryContext(20)).group, 'carpet-tiles')).toBe(CARPET.cols * CARPET.rows);
    expect(named(buildFinale(fakeGalleryContext(300)).group, 'carpet-tiles')).toHaveLength(2);
  });

  it('blacks out the room during the end of the dive', () => {
    const ctx = fakeGalleryContext(20);
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
    const ctx = fakeGalleryContext(20);
    const finale = buildFinale(ctx);
    const mosaic = requireSegment(ctx.sequence, 'mosaic');
    const [carpet] = named(finale.group, 'carpet');
    const [tiles] = named(finale.group, 'carpet-tiles') as InstancedMesh[];
    const [overlay] = named(finale.group, 'mosaic-overlay') as Mesh<never, MeshBasicMaterial>[];
    const c = new Color();
    finale.update!(mosaic.start);
    expect(carpet.position.toArray()).toEqual(ctx.gallery.finale.carpet);
    tiles.getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
    expect(overlay.material.opacity).toBe(0);
    finale.update!(mosaic.end - 1e-6);
    carpet.position.toArray().forEach((v, i) => expect(v).toBeCloseTo(ctx.gallery.finale.lifted[i], 3));
    expect(carpet.scale.x).toBeCloseTo(0.3, 3);
    expect(overlay.material.opacity).toBeCloseTo(1, 3);
    tiles.getColorAt(0, c);
    expect(c.r).not.toBe(1);
  });

  it('grows the network from the portrait sphere outwards; its lines never write depth (review I1)', () => {
    const ctx = fakeGalleryContext(30);
    const finale = buildFinale(ctx);
    const network = findSegment(ctx.sequence, 'network')!;
    const [core] = named(finale.group, 'network-core');
    const [nodes] = named(finale.group, 'network-nodes') as InstancedMesh[];
    const m = new Matrix4();
    const scaleOf = (i: number) => { nodes.getMatrixAt(i, m); return new Vector3().setFromMatrixScale(m).x; };
    finale.update!(network.start);
    expect(core.scale.x).toBe(0);
    expect(scaleOf(0)).toBe(0);
    finale.update!(network.end - 1e-6);
    expect(core.scale.x).toBe(1);
    expect(scaleOf(0)).toBeGreaterThan(0.1);
    const lines: LineSegments[] = [];
    finale.group.traverse((o) => { if (o instanceof LineSegments) lines.push(o); });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect((l.material as LineBasicMaterial).depthWrite).toBe(false);
  });

  it('fades the end card in', () => {
    const ctx = fakeGalleryContext(12);
    const finale = buildFinale(ctx);
    const ending = requireSegment(ctx.sequence, 'ending');
    const [card] = named(finale.group, 'end-card') as Mesh<never, MeshBasicMaterial>[];
    finale.update!(ending.start);
    expect(card.material.opacity).toBe(0);
    finale.update!((ending.start + ending.end) / 2);
    expect(card.material.opacity).toBe(1);
  });
});

describe('buildGalleryWorld', () => {
  it('shows the walk until the robot door, then only the robot room; the door leaves after its wipe', () => {
    const ctx = fakeGalleryContext(20);
    const world = buildGalleryWorld(ctx.sequence, ctx.gallery, ctx.content, ctx.tex);
    const [walk] = named(world.scene, 'walk');
    const [robots] = named(world.scene, 'robots');
    const [door] = named(world.scene, 'robot-door');
    const r = requireSegment(ctx.sequence, 'robots');
    const dive = requireSegment(ctx.sequence, 'dive');
    const wipe = ctx.gallery.track.wipes.find((w) => w.name === 'robot-door')!;
    world.update(r.start - 0.01);
    expect([walk.visible, robots.visible, door.parent!.visible]).toEqual([true, false, true]);
    world.update(r.start);
    expect([walk.visible, robots.visible, door.parent!.visible]).toEqual([false, true, true]);
    world.update(wipe.end + 0.01);
    expect(door.parent!.visible).toBe(false);
    world.update(dive.end + 0.1);
    expect(robots.visible).toBe(false);
  });

  it('changes bloom smoothly in every cut (review I3)', () => {
    for (const c of CUTS) {
      const ctx = fakeGalleryContext(8, c.mode, { music: c.music });
      const world = buildGalleryWorld(ctx.sequence, ctx.gallery, ctx.content, ctx.tex);
      const ending = requireSegment(ctx.sequence, 'ending');
      for (let t = 0; t + 1 / 30 < ending.start; t += 1 / 30) {
        expect(Math.abs(world.bloomAt(t + 1 / 30, 0) - world.bloomAt(t, 0)), `${c.mode} t=${t.toFixed(2)}`).toBeLessThan(0.05);
      }
      expect(world.bloomAt(0, 0)).toBeCloseTo(0.2, 9);
      expect(world.bloomAt(ctx.sequence.total, 0)).toBeCloseTo(0.25, 9);
    }
  });

  it('AO strength follows the bloom level continuously', () => {
    expect(aoIntensityFor(0.2)).toBeCloseTo(2.2, 12);
    expect(aoIntensityFor(1.1)).toBeCloseTo(1.0, 12);
    for (let g = 0.2; g < 1.1; g += 0.01) expect(Math.abs(aoIntensityFor(g + 0.01) - aoIntensityFor(g))).toBeLessThan(0.03);
  });

  it('updates at every time in every cut and disposes cleanly', () => {
    for (const c of CUTS) {
      const ctx = fakeGalleryContext(8, c.mode, { music: c.music });
      const world = buildGalleryWorld(ctx.sequence, ctx.gallery, ctx.content, ctx.tex);
      for (let t = 0; t <= ctx.sequence.total; t += 0.7) world.update(t);
      expect(() => world.dispose()).not.toThrow();
    }
  });
});
