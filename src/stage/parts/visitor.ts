import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry, type Material } from 'three';
import type { VisitorSpot } from '../layout';

export interface VisitorMaterials {
  shirt: Material;
  pants: Material;
  skin: Material;
  hair: Material;
  shoes: Material;
  silhouette: Material;
}

type Part = keyof Omit<VisitorMaterials, 'silhouette'>;

/** A standing gallery visitor (≈1.83 m), facing local +Z; pose 0 arms down, 1 arms crossed, 2 hands in pockets. */
export function createVisitor(spot: VisitorSpot, m: VisitorMaterials): Group {
  const group = new Group();
  group.name = 'visitor';
  const mat = (part: Part) => (spot.dark ? m.silhouette : m[part]);
  const add = (geometry: BufferGeometry, part: Part, x: number, y: number, z = 0): Mesh => {
    const mesh = new Mesh(geometry, mat(part));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const leg = new CapsuleGeometry(0.07, 0.74, 6, 12);
  add(leg, 'pants', -0.1, 0.51);
  add(leg, 'pants', 0.1, 0.51);
  const shoe = new BoxGeometry(0.11, 0.07, 0.26);
  add(shoe, 'shoes', -0.1, 0.035, 0.04);
  add(shoe, 'shoes', 0.1, 0.035, 0.04);
  add(new CapsuleGeometry(0.15, 0.1, 6, 16), 'pants', 0, 0.98).scale.set(1.25, 1, 0.8);
  add(new CapsuleGeometry(0.17, 0.42, 6, 16), 'shirt', 0, 1.3).scale.set(1.2, 1, 0.72);
  add(new CylinderGeometry(0.05, 0.055, 0.1, 12), 'skin', 0, 1.6);
  add(new SphereGeometry(0.105, 20, 16), 'skin', 0, 1.72).scale.set(0.92, 1.08, 1);
  add(new SphereGeometry(0.108, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), 'hair', 0, 1.735).scale.set(0.95, 1.05, 1.03);

  const upper = new CapsuleGeometry(0.05, 0.26, 6, 12);
  const fore = new CapsuleGeometry(0.045, 0.24, 6, 12);
  if (spot.pose === 0) {
    for (const s of [-1, 1]) {
      add(upper, 'shirt', s * 0.25, 1.33).rotation.z = s * 0.06;
      add(fore, 'shirt', s * 0.27, 1.03).rotation.z = s * 0.04;
    }
  } else if (spot.pose === 1) {
    for (const s of [-1, 1]) add(upper, 'shirt', s * 0.24, 1.33, 0.02).rotation.x = -0.2;
    add(fore, 'shirt', 0.03, 1.2, 0.15).rotation.z = Math.PI / 2;
    add(fore, 'shirt', -0.03, 1.16, 0.17).rotation.z = Math.PI / 2;
  } else {
    for (const s of [-1, 1]) {
      add(upper, 'shirt', s * 0.26, 1.33).rotation.z = s * 0.12;
      add(fore, 'shirt', s * 0.25, 1.06, -0.03).rotation.z = -s * 0.35;
    }
  }

  group.scale.setScalar(spot.scale);
  group.position.set(...spot.pos);
  group.rotation.y = spot.yaw;
  return group;
}
