import { CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry, type Material } from 'three';

/** A faceless, low-detail standing figure about 1.84 m tall, feet at y = 0. */
export function createVisitor(material: Material): Group {
  const group = new Group();
  group.name = 'visitor';
  const part = (geometry: BufferGeometry, x: number, y: number): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    group.add(mesh);
    return mesh;
  };
  const leg = new CapsuleGeometry(0.075, 0.72, 6, 12);
  part(leg, -0.1, 0.46);
  part(leg, 0.1, 0.46);
  part(new CapsuleGeometry(0.17, 0.46, 6, 16), 0, 1.18).scale.set(1.15, 1, 0.7);
  const arm = new CapsuleGeometry(0.055, 0.56, 6, 12);
  part(arm, -0.27, 1.13).rotation.z = 0.08;
  part(arm, 0.27, 1.13).rotation.z = -0.08;
  part(new CylinderGeometry(0.05, 0.06, 0.1, 12), 0, 1.6);
  part(new SphereGeometry(0.11, 20, 16), 0, 1.73).scale.set(0.9, 1.05, 1);
  return group;
}
