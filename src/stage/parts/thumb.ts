import { BoxGeometry, Group, Mesh, type Material } from 'three';
import { mulberry32 } from '../../util/rng';

/** Moves every vertex by a deterministic offset keyed on its position, so shared corners stay shared. */
function jitter(geometry: BoxGeometry, rnd: () => number, amount: number): void {
  const pos = geometry.getAttribute('position');
  const offsets = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let o = offsets.get(key);
    if (!o) {
      o = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount];
      offsets.set(key, o);
    }
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  pos.needsUpdate = true;
}

/** Low-poly "like" hand: cuff, fist, four curled fingers on +X, thumb up on −X. About 3.2 m tall. */
export function createThumbSculpture(material: Material, seed: number): Group {
  const rnd = mulberry32(seed);
  const group = new Group();
  group.name = 'thumb';
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => {
    const geometry = new BoxGeometry(w, h, d, 2, 2, 2);
    jitter(geometry, rnd, 0.07);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
  };
  block(1.1, 0.7, 0.9, 0, 0.35, 0);
  block(1.25, 1.2, 1.0, 0.05, 1.3, 0);
  for (let i = 0; i < 4; i++) block(0.5, 0.28, 0.9, 0.62, 0.86 + i * 0.3, 0.02);
  block(0.42, 0.9, 0.62, -0.28, 2.3, 0, 0.12);
  block(0.36, 0.5, 0.55, -0.34, 2.95, 0, 0.18);
  return group;
}
