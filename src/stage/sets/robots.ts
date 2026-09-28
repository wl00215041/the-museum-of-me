import {
  BoxGeometry, DirectionalLight, DoubleSide, Euler, HemisphereLight, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, Quaternion, Vector3, type InstancedMesh,
} from 'three';
import type { ShotId } from '../../types';
import type { SetContext, StageSet } from '../context';
import { disposeScene } from '../dispose';
import { ROBOT_TILES, type RobotsLayout } from '../layout';
import { buildAtlasInstances, cellTexture, type AtlasInstance } from '../parts/atlas-mesh';
import { armAngles, createRobotArm } from '../parts/robot-arm';
import { whiteScene } from './common';

type Floater = RobotsLayout['floaters'][number];

function floaterMatrix(f: Floater, t: number): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(0.2 * Math.sin(0.3 * t + f.phase), f.phase + 0.1 * t, 0));
  return new Matrix4().compose(new Vector3(f.pos[0], f.pos[1] + 0.15 * Math.sin(0.4 * t + f.phase), f.pos[2]), q, new Vector3(f.size, f.size, 1));
}

export function buildRobotsSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, mats } = ctx;
  const r = layout.robots;
  const lib = content.library;
  const scene = whiteScene(0xefeeea);
  scene.add(new HemisphereLight(0xffffff, 0xd9d6cf, 1.3));
  const sun = new DirectionalLight(0xffffff, 0.7);
  sun.position.set(8, 12, 6);
  scene.add(sun);

  const floor = new Mesh(new PlaneGeometry(40, 30), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  const back = new Mesh(new PlaneGeometry(40, 12), mats.wall);
  back.position.set(0, 6, -12);
  const platform = new Mesh(new BoxGeometry(r.platform.width, r.platform.height, r.platform.depth), mats.platform);
  platform.position.y = r.platform.height / 2;
  scene.add(floor, back, platform);

  const tiles = buildAtlasInstances({
    geometry: new BoxGeometry(ROBOT_TILES.size, 0.01, ROBOT_TILES.size),
    library: lib,
    items: r.tiles.map((tile) => ({
      photoIndex: tile.photoIndex,
      matrix: new Matrix4().compose(
        new Vector3(tile.x, r.platform.height + 0.005, tile.z),
        new Quaternion().setFromEuler(new Euler(0, tile.rotation, 0)),
        new Vector3(1, 1, 1),
      ),
    })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], true),
    rect: 'square',
  });
  for (const mesh of tiles) {
    mesh.name = 'photo-tiles';
    scene.add(mesh);
  }

  const floaters = buildAtlasInstances({
    geometry: new PlaneGeometry(1, 1),
    library: lib,
    items: r.floaters.map((f) => ({ photoIndex: f.photoIndex, matrix: floaterMatrix(f, 0), floater: f })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], false, true),
    rect: 'fit',
  });
  for (const mesh of floaters) {
    mesh.name = 'floaters';
    scene.add(mesh);
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
    scene.add(arm.group);
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
  return { ids, scene, dark: false, update, dispose: () => disposeScene(scene) };
}
