import {
  BoxGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type InstancedMesh,
} from 'three';
import { buildAtlasInstances, cellTexture, type AtlasInstance } from '../../parts/atlas-mesh';
import { armAngles, createRobotArm } from '../../parts/robot-arm';
import type { Strip } from '../../strip';
import type { RoomObject, WorldContext } from '../context';

type Floater = Strip['robots']['floaters'][number];

function floaterMatrix(f: Floater, t: number): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(0.2 * Math.sin(0.3 * t + f.phase), f.phase + 0.1 * t, 0));
  return new Matrix4().compose(new Vector3(f.pos[0], f.pos[1] + 0.15 * Math.sin(0.4 * t + f.phase), f.pos[2]), q, new Vector3(f.size, f.size, 1));
}

export function buildRobotsRoom(ctx: WorldContext): RoomObject {
  const { strip, content, mats } = ctx;
  const r = strip.robots;
  const lib = content.library;
  const group = new Group();
  group.name = 'room:robots';
  const p = r.platform;
  const platform = new Mesh(new BoxGeometry(p.width, p.height, p.depth), mats.platform);
  platform.position.set(...p.center);
  group.add(platform);

  const floaters = buildAtlasInstances({
    geometry: new PlaneGeometry(1, 1),
    library: lib,
    items: r.floaters.map((f) => ({ photoIndex: f.photoIndex, matrix: floaterMatrix(f, 0), floater: f })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], false, true),
    rect: 'fit',
  });
  for (const mesh of floaters) {
    mesh.name = 'floaters';
    group.add(mesh);
  }

  const arms = r.arms.map((spec, i) => {
    const heldMaterial = new MeshBasicMaterial({ map: cellTexture(lib, r.floaters[i % r.floaters.length].photoIndex, 'square'), side: DoubleSide });
    heldMaterial.userData.owned = true;
    heldMaterial.userData.ownsMap = true;
    const held = new Mesh(new PlaneGeometry(0.28, 0.28), heldMaterial);
    held.rotation.x = -Math.PI / 2;
    const arm = createRobotArm(mats.robot, held);
    arm.group.position.set(...spec.pos);
    arm.group.rotation.y = spec.yaw;
    group.add(arm.group);
    return { arm, phase: spec.phase };
  });

  const update = (t: number) => {
    for (const { arm, phase } of arms) arm.pose(armAngles(t, phase));
    for (const mesh of floaters as InstancedMesh[]) {
      (mesh.userData.items as (AtlasInstance & { floater: Floater })[]).forEach((item, i) => mesh.setMatrixAt(i, floaterMatrix(item.floater, t)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);
  return { group, update };
}
