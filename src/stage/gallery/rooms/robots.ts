import { BoxGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type InstancedMesh } from 'three';
import { requireSegment } from '../../../plan/sequence';
import { placeIn } from '../../frame';
import { ROBOTS } from '../../gallery';
import type { Gallery } from '../../gallery';
import { buildAtlasInstances, cellTexture, type AtlasInstance } from '../../parts/atlas-mesh';
import { armAngles, createRobotArm } from '../../parts/robot-arm';
import type { GalleryContext, RoomObject } from '../context';

type Floater = Gallery['robots']['floaters'][number];

function floaterMatrix(f: Floater, t: number): Matrix4 {
  // Facing the room's entrance, turning a little (the original's photos mostly face the camera).
  const q = new Quaternion().setFromEuler(new Euler(0.12 * Math.sin(0.3 * t + f.phase), 0.45 * Math.sin(f.phase) + 0.12 * Math.sin(0.2 * t + f.phase), 0));
  return new Matrix4().compose(new Vector3(f.pos[0], f.pos[1] + 0.15 * Math.sin(0.4 * t + f.phase), f.pos[2]), q, new Vector3(f.size, f.size, 1));
}

/** The white robot room straight ahead after the door (original 125–150 s). */
export function buildRobotsRoom(ctx: GalleryContext): RoomObject {
  const { gallery, content, mats, sequence } = ctx;
  const r = gallery.robots;
  const lib = content.library;
  const segment = requireSegment(sequence, 'robots');
  const group = placeIn(r.frame, new Group());
  group.name = 'room:robots';
  const p = r.platform;
  const platform = new Mesh(new BoxGeometry(p.width, p.height, p.depth), mats.platform);
  platform.position.set(p.center[0], p.center[1], p.center[2]);
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
    const held = new Mesh(new PlaneGeometry(0.5, 0.5), heldMaterial);
    held.name = 'held-photo';
    held.rotation.x = -Math.PI / 2;
    const arm = createRobotArm(mats.robot, held);
    arm.group.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    arm.group.rotation.y = spec.yaw;
    arm.group.scale.setScalar(ROBOTS.armScale);
    group.add(arm.group);
    return { arm, phase: spec.phase };
  });

  const update = (t: number) => {
    // Hidden until the door (review M8: no work while the room is out of the scene).
    if (t < segment.start - 0.5) return;
    for (const { arm, phase } of arms) arm.pose(armAngles(t, phase));
    for (const mesh of floaters as InstancedMesh[]) {
      (mesh.userData.items as (AtlasInstance & { floater: Floater })[]).forEach((item, i) => mesh.setMatrixAt(i, floaterMatrix(item.floater, t)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(segment.start);
  return { group, update };
}
