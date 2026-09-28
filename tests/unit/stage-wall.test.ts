import { InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildEndingSet } from '../../src/stage/sets/ending';
import { buildWallSet } from '../../src/stage/sets/wall';
import { WALL_SHOTS } from '../../src/stage/wall-run';
import { fakeContext } from './fake-stage';

const wallIds = (ctx: ReturnType<typeof fakeContext>) => ctx.storyboard.shots.map((s) => s.id).filter((id) => WALL_SHOTS.includes(id));
const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('wall set', () => {
  it('hangs the texts, the portraits, every photo and the visitors', () => {
    const ctx = fakeContext(20);
    const set = buildWallSet(ctx, wallIds(ctx));
    expect(set.dark).toBe(false);
    for (const name of ['title', 'intro', 'exhibition', 'plaque:Portraits', 'plaque:Photos']) expect(named(set.scene, name)).toHaveLength(1);
    expect(named(set.scene, 'portrait-block')).toHaveLength(ctx.layout.wall.portraits!.items.length);
    const swarm = named(set.scene, 'photo-swarm') as InstancedMesh[];
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(20);
    expect(named(set.scene, 'visitor')).toHaveLength(ctx.layout.wall.visitors.length);
  });

  it('spreads more than 256 photos over two atlas meshes', () => {
    const ctx = fakeContext(300);
    const swarm = named(buildWallSet(ctx, wallIds(ctx)).scene, 'photo-swarm') as InstancedMesh[];
    expect(swarm.map((m) => m.count)).toEqual([256, 44]);
  });

  it('the 30 s cut has no intro and no portraits', () => {
    const ctx = fakeContext(20, 30);
    const set = buildWallSet(ctx, wallIds(ctx));
    expect(named(set.scene, 'intro')).toHaveLength(0);
    expect(named(set.scene, 'plaque:Portraits')).toHaveLength(0);
    expect(named(set.scene, 'plaque:Photos')).toHaveLength(1);
  });

  it('keeps a very long name inside the exhibition box', () => {
    const ctx = fakeContext(10, 'auto', { textAspect: 30 });
    const [exhibition] = named(buildWallSet(ctx, wallIds(ctx)).scene, 'exhibition') as Mesh[];
    expect((exhibition.geometry as PlaneGeometry).parameters.width).toBeLessThanOrEqual(ctx.layout.wall.exhibition.width + 1e-9);
  });

  it('requires high-resolution textures for featured photos', () => {
    const ctx = fakeContext(12, 'auto', { hires: false });
    expect(() => buildWallSet(ctx, wallIds(ctx))).toThrow(/high-resolution/);
  });

  it('disposes without throwing', () => {
    const ctx = fakeContext(12);
    expect(() => buildWallSet(ctx, wallIds(ctx)).dispose()).not.toThrow();
  });
});

describe('ending set', () => {
  it('fades the end card and the tagline in', () => {
    const ctx = fakeContext(12);
    const set = buildEndingSet(ctx, ['ending']);
    const span = ctx.storyboard.shots.find((s) => s.id === 'ending')!;
    const card = named(set.scene, 'end-card')[0] as Mesh<PlaneGeometry, MeshBasicMaterial>;
    const tagline = named(set.scene, 'tagline')[0] as Mesh<PlaneGeometry, MeshBasicMaterial>;
    set.update(span.start);
    expect(card.material.opacity).toBe(0);
    expect(tagline.material.opacity).toBe(0);
    set.update((span.start + span.end) / 2);
    expect(card.material.opacity).toBe(1);
    expect(card.position.y).toBeCloseTo(0, 12);
    expect(tagline.material.opacity).toBeGreaterThan(0);
    expect(set.dark).toBe(true);
  });
});
