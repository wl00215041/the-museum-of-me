import {
  AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, Points, PointsMaterial, Quaternion, SphereGeometry, Vector3,
} from 'three';
import type { ShotId, Vec3 } from '../../types';
import { hiresOf, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { buildAtlasInstances } from '../parts/atlas-mesh';
import { darkScene } from './common';

export function buildNetworkSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats, storyboard } = ctx;
  const span = spanOf(storyboard, 'network');
  const net = layout.network;
  const lib = content.library;
  const scene = darkScene();
  scene.background = new Color(0x000000);
  const group = new Group();
  group.name = 'network';
  scene.add(group);

  const centerMaterial = new MeshBasicMaterial({ map: hiresOf(content, layout.portraitIndex) });
  centerMaterial.userData.owned = true;
  group.add(new Mesh(new SphereGeometry(0.55, 48, 32), centerMaterial));

  for (const mesh of buildAtlasInstances({
    geometry: new SphereGeometry(1, 20, 14),
    library: lib,
    items: net.nodes.map((node) => ({
      photoIndex: node.photoIndex,
      matrix: new Matrix4().compose(new Vector3(...node.pos), new Quaternion(), new Vector3(node.radius, node.radius, node.radius)),
    })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], false),
    rect: 'square',
  })) {
    mesh.name = 'network-nodes';
    group.add(mesh);
  }

  const posOf = (i: number): Vec3 => (i < 0 ? [0, 0, 0] : net.nodes[i].pos);
  const edgeGeometry = new BufferGeometry();
  edgeGeometry.setAttribute('position', new Float32BufferAttribute(net.edges.flatMap(([a, b]) => [...posOf(a), ...posOf(b)]), 3));
  group.add(new LineSegments(edgeGeometry, mats.nodeLine));

  const points = (positions: number[], size: number, color: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({ size, color, map: tex.glow(), transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const p = new Points(geometry, material);
    p.name = name;
    return p;
  };
  const star = (i: number) => net.stars.slice(i * 3, i * 3 + 3);
  group.add(points(net.stars, 0.09, 0xdfe8ff, 'stars'));
  group.add(points(net.highlights.flatMap(star), 0.28, 0x4aa3ff, 'highlights'));
  const starEdgeGeometry = new BufferGeometry();
  starEdgeGeometry.setAttribute('position', new Float32BufferAttribute(net.starEdges.flatMap(([a, b]) => [...star(a), ...star(b)]), 3));
  group.add(new LineSegments(starEdgeGeometry, mats.starLine));

  return {
    ids,
    scene,
    dark: true,
    update(t) {
      group.rotation.y = 0.06 * (t - span.start);
    },
    dispose: () => disposeScene(scene),
  };
}
