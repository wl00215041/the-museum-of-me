import { InstancedMesh, Mesh, PlaneGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildPhotosRoom } from '../../src/stage/world/rooms/photos';
import { buildPortraitsRoom } from '../../src/stage/world/rooms/portraits';
import { buildWallRoom } from '../../src/stage/world/rooms/wall';
import { buildShell } from '../../src/stage/world/shell';
import { fakeWorldContext } from './fake-world';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('shell', () => {
  it('builds a back wall and floor per room, a partition per boundary and a pillar where the camera passes', () => {
    const ctx = fakeWorldContext(20);
    const shell = buildShell(ctx);
    expect(named(shell, 'back-wall')).toHaveLength(ctx.strip.rooms.length);
    expect(named(shell, 'floor')).toHaveLength(ctx.strip.rooms.length);
    expect(named(shell, 'partition')).toHaveLength(ctx.strip.boundaries.length);
    expect(named(shell, 'pillar')).toHaveLength(ctx.strip.boundaries.filter((b) => !b.low).length);
    expect(named(shell, 'end-wall')).toHaveLength(1);
  });

  it('partitions show each room its own wall colour', () => {
    const ctx = fakeWorldContext(20);
    const shell = buildShell(ctx);
    const b = ctx.strip.boundaries.find((x) => !x.left.dark && x.right.dark)!;
    const partition = (named(shell, 'partition') as Mesh[]).find((m) => Math.abs(m.position.x - b.x) < 1e-9)!;
    const materials = partition.material as unknown[];
    expect(materials[0]).toBe(ctx.mats.darkWall);
    expect(materials[1]).toBe(ctx.mats.wall);
  });
});

describe('white rooms', () => {
  it('the wall room hangs title, exhibition and intro in order along x', () => {
    const ctx = fakeWorldContext(20);
    const room = buildWallRoom(ctx);
    const [title] = named(room.group, 'title');
    const [exhibition] = named(room.group, 'exhibition');
    const [intro] = named(room.group, 'intro');
    expect(title.position.x).toBeLessThan(exhibition.position.x);
    expect(exhibition.position.x).toBeLessThan(intro.position.x);
    expect(exhibition.position.x).toBeCloseTo(ctx.strip.wall.exhibition.center[0], 9);
    expect(named(room.group, 'intro-avatar')).toHaveLength(1);
  });

  it('a long name still fits the exhibition box', () => {
    const ctx = fakeWorldContext(10, 'auto', { textAspect: 30 });
    const [exhibition] = named(buildWallRoom(ctx).group, 'exhibition') as Mesh[];
    expect((exhibition.geometry as PlaneGeometry).parameters.width).toBeLessThanOrEqual(ctx.strip.wall.exhibition.width + 1e-9);
  });

  it('portraits and photos rooms hang every exhibit with their label and visitors', () => {
    const ctx = fakeWorldContext(30);
    const portraits = buildPortraitsRoom(ctx)!;
    expect(named(portraits.group, 'portrait-block')).toHaveLength(ctx.strip.portraits!.items.length);
    expect(named(portraits.group, 'label:Portraits')).toHaveLength(1);
    const photos = buildPhotosRoom(ctx);
    const swarm = named(photos.group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(30);
    expect(named(photos.group, 'visitor')).toHaveLength(ctx.strip.photos.visitors.length);
    expect(named(photos.group, 'label:Photos')).toHaveLength(1);
  });

  it('the photo swarm spreads more than 256 photos over two atlas meshes', () => {
    const swarm = named(buildPhotosRoom(fakeWorldContext(300)).group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.map((m) => m.count)).toEqual([256, 44]);
  });

  it('the 30 s cut has no portraits room', () => {
    expect(buildPortraitsRoom(fakeWorldContext(12, 30))).toBeNull();
  });
});
