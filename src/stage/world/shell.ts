import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Material } from 'three';
import { BOUNDARY } from '../strip';
import type { WorldContext } from './context';

const FRONT = 18;

/** Back walls, floors, partitions (each face in its own room's colour), pillars and the far end wall. */
export function buildShell(ctx: WorldContext): Group {
  const { strip, mats, tex } = ctx;
  const group = new Group();
  group.name = 'shell';
  const concrete = tex.concrete();
  const concreteFloor = (width: number, depth: number): Material => {
    const map = concrete.clone();
    map.repeat.set(width / 4, depth / 4);
    map.needsUpdate = true;
    const material = new MeshStandardMaterial({ map, roughness: 0.7 });
    material.userData.owned = true;
    material.userData.ownsMap = true;
    return material;
  };
  const add = (mesh: Mesh, name: string) => {
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  strip.rooms.forEach((room, i) => {
    const left = i === 0 ? room.x0 - 10 : room.x0 - BOUNDARY.partition / 2;
    const right = room.x1 + BOUNDARY.partition / 2;
    const width = right - left;
    const cx = (left + right) / 2;
    const back = add(new Mesh(new PlaneGeometry(width, room.height), room.dark ? mats.darkWall : mats.wall), 'back-wall');
    back.position.set(cx, room.height / 2, room.backZ);
    const depth = FRONT - room.backZ;
    const floor = add(new Mesh(new PlaneGeometry(width, depth), room.dark ? mats.darkFloor : concreteFloor(width, depth)), 'floor');
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, room.backZ + depth / 2);
  });

  for (const b of strip.boundaries) {
    const depth = b.low ? BOUNDARY.lowDepth : BOUNDARY.depth;
    const back = Math.min(b.left.backZ, b.right.backZ);
    const h = Math.max(b.left.height, b.right.height);
    const dark = b.left.dark || b.right.dark;
    const edge = dark ? mats.darkWall : mats.wall;
    // BoxGeometry groups: +x, −x, +y, −y, +z, −z. +x faces the right room, −x the left room.
    const partition = add(
      new Mesh(new BoxGeometry(BOUNDARY.partition, h, depth - back), [
        b.right.dark ? mats.darkWall : mats.wall,
        b.left.dark ? mats.darkWall : mats.wall,
        edge, edge, edge, edge,
      ]),
      'partition',
    );
    partition.position.set(b.x, h / 2, back + (depth - back) / 2);
    if (!b.low) {
      const pillar = add(new Mesh(new BoxGeometry(BOUNDARY.pillarWidth, h, BOUNDARY.pillarDepth), dark ? mats.pillarDark : mats.pillarLight), 'pillar');
      pillar.position.set(b.x, h / 2, BOUNDARY.pillarZ);
    }
  }

  const last = strip.rooms[strip.rooms.length - 1];
  const len = FRONT - last.backZ;
  const end = add(new Mesh(new PlaneGeometry(len, last.height), mats.wall), 'end-wall');
  end.rotation.y = -Math.PI / 2;
  end.position.set(last.x1, last.height / 2, last.backZ + len / 2);
  return group;
}
