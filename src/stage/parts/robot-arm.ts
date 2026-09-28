import { BoxGeometry, CylinderGeometry, Group, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';

export interface ArmAngles {
  base: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  /** 0 = open, 1 = closed. */
  grip: number;
}

/** Deterministic, slowly varying joint angles; the arm leans forward (+Z) over the platform. */
export function armAngles(t: number, phase: number): ArmAngles {
  return {
    base: 0.55 * Math.sin(0.33 * t + phase),
    shoulder: 0.45 + 0.25 * Math.sin(0.47 * t + phase * 1.3),
    elbow: 1.35 + 0.3 * Math.sin(0.61 * t + phase),
    wrist: 0.7 + 0.3 * Math.sin(0.83 * t + phase * 0.7),
    grip: 0.5 + 0.5 * Math.sin(1.05 * t + phase),
  };
}

export interface RobotArm {
  group: Group;
  gripper: Object3D;
  pose(angles: ArmAngles): void;
}

/** Industrial arm reaching along local +Z: base, turret, shoulder, upper arm, elbow, forearm, wrist, gripper. */
export function createRobotArm(m: { shell: Material; joint: Material; accent: Material }, held?: Object3D): RobotArm {
  const group = new Group();
  group.name = 'robot-arm';
  const mesh = (geometry: BufferGeometry, material: Material, parent: Object3D, x = 0, y = 0, z = 0): Mesh => {
    const out = new Mesh(geometry, material);
    out.position.set(x, y, z);
    parent.add(out);
    return out;
  };
  mesh(new CylinderGeometry(0.55, 0.65, 0.35, 32), m.joint, group, 0, 0.175);
  const turret = new Group();
  turret.position.y = 0.35;
  group.add(turret);
  mesh(new CylinderGeometry(0.42, 0.48, 0.55, 32), m.shell, turret, 0, 0.275);
  const shoulder = new Group();
  shoulder.position.y = 0.7;
  turret.add(shoulder);
  mesh(new CylinderGeometry(0.26, 0.26, 0.62, 24), m.joint, shoulder).rotation.z = Math.PI / 2;
  mesh(new BoxGeometry(0.34, 1.7, 0.4), m.shell, shoulder, 0, 0.85);
  const elbow = new Group();
  elbow.position.y = 1.7;
  shoulder.add(elbow);
  mesh(new CylinderGeometry(0.2, 0.2, 0.5, 24), m.joint, elbow).rotation.z = Math.PI / 2;
  mesh(new BoxGeometry(0.26, 1.45, 0.3), m.shell, elbow, 0, 0.72);
  mesh(new CylinderGeometry(0.05, 0.05, 1.2, 12), m.accent, elbow, 0.18, 0.7);
  const wrist = new Group();
  wrist.position.y = 1.45;
  elbow.add(wrist);
  mesh(new CylinderGeometry(0.15, 0.15, 0.28, 20), m.joint, wrist, 0, 0.14);
  const gripper = new Group();
  gripper.name = 'gripper';
  gripper.position.y = 0.3;
  wrist.add(gripper);
  const fingers = [-1, 1].map((s) => mesh(new BoxGeometry(0.05, 0.26, 0.12), m.accent, gripper, s * 0.1, 0.13));
  if (held) {
    held.position.set(0, 0.28, 0);
    gripper.add(held);
  }
  const pose = (a: ArmAngles) => {
    turret.rotation.y = a.base;
    shoulder.rotation.x = a.shoulder;
    elbow.rotation.x = a.elbow;
    wrist.rotation.x = a.wrist;
    fingers[0].position.x = -0.06 - 0.06 * a.grip;
    fingers[1].position.x = 0.06 + 0.06 * a.grip;
  };
  pose(armAngles(0, 0));
  return { group, gripper, pose };
}
