import { BoxGeometry, CylinderGeometry, Group, Mesh, PlaneGeometry, type Material } from 'three';

/** An old tube TV on a pole (original 94–101 s): screen facing +z at the origin, the box behind, the foot on the floor. */
export function createCrt(o: { body: Material; stand: Material; screen: Material; width: number; height: number; standHeight: number }): Group {
  const group = new Group();
  group.name = 'crt';
  const w = o.width + 0.12;
  const h = o.height + 0.12;
  const d = 0.42;
  const box = new Mesh(new BoxGeometry(w, h, d), o.body);
  box.position.z = -d / 2 - 0.002;
  const screen = new Mesh(new PlaneGeometry(o.width, o.height), o.screen);
  screen.name = 'screen';
  const poleHeight = Math.max(0.05, o.standHeight - h / 2);
  const pole = new Mesh(new CylinderGeometry(0.025, 0.03, poleHeight, 10), o.stand);
  pole.position.set(0, -h / 2 - poleHeight / 2, -d / 2);
  const foot = new Mesh(new CylinderGeometry(0.22, 0.24, 0.03, 20), o.stand);
  foot.position.set(0, -o.standHeight + 0.015, -d / 2);
  group.add(box, screen, pole, foot);
  return group;
}
