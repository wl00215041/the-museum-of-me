import { BoxGeometry, Group, Mesh, PlaneGeometry, type Material } from 'three';
import { DOOR, ROOM_GAP, WALL_T, type Room } from './layout';
import type { Materials } from './materials';

function box(material: Material, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** End wall at depth z; a doorway is cut by building it from three boxes, which also gives the jambs faces. */
function endWall(material: Material, width: number, height: number, z: number, door: boolean): Mesh[] {
  const full = width + 2 * WALL_T;
  if (!door) return [box(material, full, height, WALL_T, 0, height / 2, z)];
  const side = (full - DOOR.width) / 2;
  return [
    box(material, side, height, WALL_T, -(DOOR.width / 2 + side / 2), height / 2, z),
    box(material, side, height, WALL_T, DOOR.width / 2 + side / 2, height / 2, z),
    box(material, DOOR.width, height - DOOR.height, WALL_T, 0, DOOR.height + (height - DOOR.height) / 2, z),
  ];
}

/** Floor, ceiling with skylight, and walls; walls sit outside the room's inner bounds. */
export function buildRoomShell(room: Room, mats: Materials): Group {
  const group = new Group();
  group.name = `shell:${room.id}`;
  const { width, height, z0, z1 } = room;
  const length = z0 - z1;
  const zc = (z0 + z1) / 2;

  const floor = new Mesh(new PlaneGeometry(width, length), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zc);
  const ceiling = new Mesh(new PlaneGeometry(width, length), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, zc);
  const skylight = new Mesh(new PlaneGeometry(Math.max(1, width - 4), Math.max(1, length - 4)), mats.skylight);
  skylight.rotation.x = Math.PI / 2;
  skylight.position.set(0, height - 0.02, zc);
  group.add(floor, ceiling, skylight);

  for (const side of [-1, 1]) {
    group.add(box(mats.wall, WALL_T, height, length + 2 * WALL_T, side * (width / 2 + WALL_T / 2), height / 2, zc));
  }
  group.add(...endWall(mats.wall, width, height, z0 + WALL_T / 2, room.entryDoor));
  group.add(...endWall(mats.wall, width, height, z1 - WALL_T / 2, room.exitDoor));

  if (room.exitDoor) {
    const threshold = new Mesh(new PlaneGeometry(DOOR.width, ROOM_GAP), mats.floor);
    threshold.rotation.x = -Math.PI / 2;
    threshold.position.set(0, 0, z1 - ROOM_GAP / 2);
    group.add(threshold);
  }
  return group;
}
