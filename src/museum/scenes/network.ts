import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, MeshBasicMaterial, type Texture } from 'three';
import type { SceneContext, SceneObject } from '../context';

/** Same image data as `src`, cropped to a centred square through the UV transform. */
function squareCrop(src: Texture, aspect: number): Texture {
  const t = src.clone();
  if (aspect > 1) {
    t.repeat.set(1 / aspect, 1);
    t.offset.set((1 - 1 / aspect) / 2, 0);
  } else {
    t.repeat.set(1, aspect);
    t.offset.set(0, (1 - aspect) / 2);
  }
  t.needsUpdate = true;
  return t;
}

export function buildNetwork({ layout, span, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  const net = layout.network;
  if (!net) return { group };
  group.name = 'network';
  group.position.set(...net.center);
  const geometry = new BoxGeometry(net.nodeSize, net.nodeSize, net.nodeSize);
  const cubes = net.nodes.map((p, i) => {
    const photo = content.photos[i];
    const material = new MeshBasicMaterial({ map: squareCrop(photo.texture, photo.aspect) });
    material.userData.ownsMap = true;
    const cube = new Mesh(geometry, material);
    cube.position.set(...p);
    group.add(cube);
    return cube;
  });
  const positions = net.edges.flatMap(([a, b]) => [...net.nodes[a], ...net.nodes[b]]);
  const lines = new BufferGeometry();
  lines.setAttribute('position', new Float32BufferAttribute(positions, 3));
  group.add(new LineSegments(lines, mats.edge));
  return {
    group,
    update: (t) => {
      const local = t - span.start;
      group.rotation.y = local * 0.22;
      cubes.forEach((c, i) => {
        c.rotation.x = local * 0.3 + i;
        c.rotation.y = local * 0.2 + i * 0.5;
      });
    },
  };
}
