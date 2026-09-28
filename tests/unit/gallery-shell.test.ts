import { InstancedMesh, Mesh, PlaneGeometry, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { toWorld } from '../../src/stage/frame';
import { MAX_WALL_PHOTOS } from '../../src/stage/placement';
import { buildLabels } from '../../src/stage/gallery/common';
import { buildPhotosRoom } from '../../src/stage/gallery/rooms/photos';
import { buildPortraitsRoom } from '../../src/stage/gallery/rooms/portraits';
import { buildWallRoom } from '../../src/stage/gallery/rooms/wall';
import { buildGalleryShell } from '../../src/stage/gallery/shell';
import type { Vec3 } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const meshNames = (root: Object3D) => { const out: string[] = []; root.traverse((o) => { if (o instanceof Mesh) out.push(o.name); }); return out.sort(); };
const worldPos = (o: Object3D): Vec3 => { o.updateWorldMatrix(true, false); return new Vector3().setFromMatrixPosition(o.matrixWorld).toArray() as Vec3; };

describe('gallery shell', () => {
  it('builds every wall, floor and block into its region; the robot door is timed', () => {
    const ctx = fakeGalleryContext(20);
    const shell = buildGalleryShell(ctx);
    const g = ctx.gallery;
    const expected = (region: string) => [...g.walls, ...g.floors, ...g.blocks].filter((x) => x.region === region).map((x) => x.name).sort();
    expect(meshNames(shell.walk)).toEqual(expected('walk'));
    expect(meshNames(shell.robots)).toEqual(expected('robots'));
    expect(meshNames(shell.both)).toEqual(expected('both'));
    expect(shell.timed).toHaveLength(1);
    expect(shell.timed[0].until).toBe(g.track.wipes.find((w) => w.name === 'robot-door')!.end);
  });

  it('puts each wall where its frame says, facing its room', () => {
    const ctx = fakeGalleryContext(20);
    const shell = buildGalleryShell(ctx);
    for (const name of ['recess-left', 'likes-wall', 'white-end']) {
      const w = ctx.gallery.walls.find((x) => x.name === name)!;
      const [mesh] = named(shell.walk, name);
      worldPos(mesh).forEach((v, i) => expect(v).toBeCloseTo(toWorld(w.frame, [w.center[0], w.center[1], 0])[i], 9));
    }
    const [recess] = named(shell.walk, 'recess-left');
    const normal = new Vector3(0, 0, 1).transformDirection(recess.matrixWorld);
    expect(normal.x).toBeCloseTo(1, 9);
  });
});

describe('white rooms', () => {
  it('hangs title, exhibition and intro in order along x, and a text column on the white block', () => {
    const ctx = fakeGalleryContext(20);
    const room = buildWallRoom(ctx);
    const [title] = named(room.group, 'title');
    const [exhibition] = named(room.group, 'exhibition');
    const [intro] = named(room.group, 'intro');
    expect(title.position.x).toBeLessThan(exhibition.position.x);
    expect(exhibition.position.x).toBeLessThan(intro.position.x);
    expect(exhibition.position.x).toBeCloseTo(ctx.gallery.wall.exhibition.center[0], 9);
    expect(named(room.group, 'intro-avatar')).toHaveLength(1);
    const [blockText] = named(room.group, 'block-text');
    const b = ctx.gallery.wall.blockText!;
    worldPos(blockText).forEach((v, i) => expect(v).toBeCloseTo(toWorld(b.frame, b.center)[i], 9));
  });

  it('a long name still fits the exhibition box', () => {
    const ctx = fakeGalleryContext(10, 'auto', { textAspect: 30 });
    const [exhibition] = named(buildWallRoom(ctx).group, 'exhibition') as Mesh[];
    expect((exhibition.geometry as PlaneGeometry).parameters.width).toBeLessThanOrEqual(ctx.gallery.wall.exhibition.width + 1e-9);
  });

  it('Friends and Photos hang every exhibit and visitor', () => {
    const ctx = fakeGalleryContext(30);
    const portraits = buildPortraitsRoom(ctx)!;
    expect(named(portraits.group, 'portrait-block')).toHaveLength(ctx.gallery.portraits!.items.length);
    const photos = buildPhotosRoom(ctx);
    const swarm = named(photos.group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(30);
    expect(named(photos.group, 'visitor')).toHaveLength(ctx.gallery.photos.visitors.length);
  });

  it('the photo swarm of a large archive spans atlas meshes and hangs MAX_WALL_PHOTOS photos', () => {
    const swarm = named(buildPhotosRoom(fakeGalleryContext(300)).group, 'photo-swarm') as InstancedMesh[];
    expect(swarm).toHaveLength(2);
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(MAX_WALL_PHOTOS);
  });

  it('the 30 s cut has no Friends and no block text', () => {
    const ctx = fakeGalleryContext(12, 30);
    expect(buildPortraitsRoom(ctx)).toBeNull();
    expect(named(buildWallRoom(ctx).group, 'block-text')).toHaveLength(0);
  });

  it('builds one sign per gallery label, each in its own frame', () => {
    const ctx = fakeGalleryContext(20);
    const signs = buildLabels(ctx);
    expect(signs.children).toHaveLength(ctx.gallery.labels.length);
    const likes = ctx.gallery.labels.find((l) => l.text === 'Likes')!;
    const [sign] = named(signs, 'label:Likes');
    worldPos(sign.children[0]).forEach((v, i) => expect(v).toBeCloseTo(toWorld(likes.frame, likes.at)[i], 9));
  });
});
