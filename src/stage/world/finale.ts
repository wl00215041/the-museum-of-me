import {
  AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, SphereGeometry, Vector3, type InstancedMesh, type Material,
} from 'three';
import { findSegment, localU, requireSegment } from '../../plan/sequence';
import type { Vec3 } from '../../types';
import { clamp, lerp, smoothstep } from '../../util/math';
import { buildAtlasInstances, createAtlasMaterial, type AtlasInstance } from '../parts/atlas-mesh';
import { cropTexture } from '../parts/canvas-block';
import { textUnits } from '../parts/led';
import { createTextPlane } from '../parts/text-plane';
import { CARPET } from '../strip';
import { hiresOf, type RoomObject, type WorldContext } from './context';

/** Multiplier that brings a photo's average colour to the cell colour (softened, clamped). */
const tintOf = (cell: number, photo: number) => 1 + (clamp(cell / Math.max(photo, 0.04), 0, 3) - 1) * 0.9;

type CarpetItem = AtlasInstance & { tint: [number, number, number] };
type NodeItem = AtlasInstance & { pos: Vec3; radius: number; delay: number };

export function buildFinale(ctx: WorldContext): RoomObject & { blackoutAt(t: number): number } {
  const { sequence, strip, content, tex, mats } = ctx;
  const lib = content.library;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const d = dive.end - dive.start;
  const group = new Group();
  group.name = 'finale';
  const owned = <M extends Material>(m: M, ownsMap = false): M => {
    m.userData.owned = true;
    m.userData.ownsMap = ownsMap;
    return m;
  };

  // Everything but the carpet fades to black: a back-faced shell drawn over the room, the carpet drawn after it.
  const blackoutMaterial = owned(new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  const blackout = new Mesh(new SphereGeometry(120, 32, 16), blackoutMaterial);
  blackout.name = 'blackout';
  blackout.renderOrder = 5;
  blackout.frustumCulled = false;
  blackout.position.set(...strip.finale.lifted);
  blackout.visible = false;
  const blackoutAt = (t: number) => smoothstep(dive.start + 0.6 * d, dive.end, t);

  // Carpet = the mosaic, laid out on the platform from the start.
  const { cols, rows, pitch, tile } = CARPET;
  const carpet = new Group();
  carpet.name = 'carpet';
  carpet.position.set(...strip.finale.carpet);
  const { colors, assignment } = content.mosaic;
  const items: CarpetItem[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const photo = assignment[i];
      const pc = lib.colors[photo];
      items.push({
        photoIndex: photo,
        matrix: new Matrix4().makeTranslation((c - (cols - 1) / 2) * pitch, 0, (r - (rows - 1) / 2) * pitch),
        color: new Color(1, 1, 1),
        tint: [tintOf(colors[i * 3], pc[0]), tintOf(colors[i * 3 + 1], pc[1]), tintOf(colors[i * 3 + 2], pc[2])],
      });
    }
  }
  const carpetMaterials = new Map<number, Material>();
  const tiles = buildAtlasInstances({
    geometry: new PlaneGeometry(tile, tile).rotateX(-Math.PI / 2),
    library: lib,
    items,
    material: (atlas) => {
      let m = carpetMaterials.get(atlas);
      if (!m) {
        m = owned(createAtlasMaterial(lib.atlases[atlas], false));
        m.transparent = true; // drawn in the transparent pass, after the blackout shell
        carpetMaterials.set(atlas, m);
      }
      return m;
    },
    rect: 'square',
  });
  for (const mesh of tiles) {
    mesh.name = 'carpet-tiles';
    mesh.renderOrder = 10;
    carpet.add(mesh);
  }
  const portrait = hiresOf(content, strip.portraitIndex);
  const overlayMaterial = owned(
    new MeshBasicMaterial({ map: cropTexture(portrait, lib.aspects[strip.portraitIndex], cols / rows), transparent: true, opacity: 0, depthWrite: false }),
    true,
  );
  const overlay = new Mesh(new PlaneGeometry(cols * pitch, rows * pitch).rotateX(-Math.PI / 2), overlayMaterial);
  overlay.name = 'mosaic-overlay';
  overlay.position.y = 0.004;
  overlay.renderOrder = 11;
  carpet.add(overlay);

  // Network around the lifted portrait.
  const net = strip.finale.network;
  const networkGroup = new Group();
  networkGroup.name = 'network';
  networkGroup.position.set(...strip.finale.lifted);
  networkGroup.visible = false;
  const core = new Mesh(new SphereGeometry(0.55, 48, 32), owned(new MeshBasicMaterial({ map: portrait })));
  core.name = 'network-core';
  core.scale.setScalar(0);
  networkGroup.add(core);
  const order = net.nodes.map((n, i) => ({ i, d: Math.hypot(...n.pos) })).sort((a, b) => a.d - b.d);
  const delays = new Array<number>(net.nodes.length);
  order.forEach(({ i }, rank) => { delays[i] = 0.05 + (0.45 * rank) / Math.max(1, order.length - 1); });
  const nodeItems: NodeItem[] = net.nodes.map((n, i) => ({
    photoIndex: n.photoIndex, matrix: new Matrix4().makeScale(0, 0, 0), pos: n.pos, radius: n.radius, delay: delays[i],
  }));
  const nodeMeshes = nodeItems.length
    ? buildAtlasInstances({ geometry: new SphereGeometry(1, 20, 14), library: lib, items: nodeItems, material: (a) => mats.atlas(lib.atlases[a], false), rect: 'square' })
    : [];
  for (const mesh of nodeMeshes) {
    mesh.name = 'network-nodes';
    networkGroup.add(mesh);
  }
  const lines = (positions: number[], color: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return new LineSegments(geometry, owned(new LineBasicMaterial({ color, transparent: true, opacity: 0 })));
  };
  const posOf = (i: number): Vec3 => (i < 0 ? [0, 0, 0] : net.nodes[i].pos);
  const edges = lines(net.edges.flatMap(([a, b]) => [...posOf(a), ...posOf(b)]), 0x9aa7b8);
  const star = (i: number) => net.stars.slice(i * 3, i * 3 + 3);
  const starEdges = lines(net.starEdges.flatMap(([a, b]) => [...star(a), ...star(b)]), 0x3b6fb6);
  const points = (positions: number[], size: number, color: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const p = new Points(geometry, owned(new PointsMaterial({ size, color, map: tex.glow(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }), true));
    p.name = name;
    return p;
  };
  const stars = points(net.stars, 0.16, 0xdfe8ff, 'stars');
  const highlights = points(net.highlights.flatMap(star), 0.28, 0x4aa3ff, 'highlights');
  networkGroup.add(edges, starEdges, stars, highlights);

  // End card, far below, framed by the fixed ending camera.
  const cardGroup = new Group();
  cardGroup.position.set(...strip.finale.card);
  cardGroup.visible = false;
  const name = content.name.toUpperCase();
  const cardTexture = tex.text({
    size: { width: 1760, height: 1080 },
    background: '#f4f4f2',
    align: 'left',
    padding: 150,
    lineGap: 0.12,
    lines: [
      { text: 'The Museum of Me', px: 84, weight: 500, family: 'serif', color: '#1d1d1d' },
      { text: name, px: Math.min(150, Math.floor(1400 / Math.max(1, textUnits(name) * 0.6))), weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: 'EXHIBITION', px: 150, weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: content.dateLabel, px: 40, weight: 500, family: 'grotesk', color: '#666666' },
    ],
  });
  const cardMaterial = owned(new MeshBasicMaterial({ map: cardTexture.texture, transparent: true, opacity: 0 }), true);
  const card = new Mesh(new PlaneGeometry(4.4, 2.7), cardMaterial);
  card.name = 'end-card';
  card.rotation.set(-0.12, 0.22, 0);
  const tagline = createTextPlane(tex.text({ color: '#e8e8e8', lines: [{ text: 'Create and explore a visual archive of your memories.', px: 36, weight: 300 }] }), 4.6, 0.3);
  tagline.name = 'tagline';
  tagline.position.y = -1.95;
  const taglineMaterial = tagline.material as MeshBasicMaterial;
  taglineMaterial.opacity = 0;
  cardGroup.add(card, tagline);

  group.add(blackout, carpet, networkGroup, cardGroup);

  const carpetFrom = new Vector3(...strip.finale.carpet);
  const carpetTo = new Vector3(...strip.finale.lifted);
  let lastTint = -1;
  const q = new Quaternion();
  const m = new Matrix4();
  const v = new Vector3();

  const update = (t: number) => {
    const b = blackoutAt(t);
    blackout.visible = b > 0 && t < dive.end;
    blackoutMaterial.opacity = b;

    const mu = localU(mosaic, t);
    const lift = smoothstep(0, 0.4, mu);
    carpet.position.lerpVectors(carpetFrom, carpetTo, lift);
    carpet.rotation.set(-0.35 * lift, 0.25 * lift + 0.12 * mu, 0);
    let scale = lerp(1, 0.3, smoothstep(0.55, 1, mu));
    overlayMaterial.opacity = smoothstep(0.55, 0.85, mu);
    const k = smoothstep(0.1, 0.7, mu);
    if (k !== lastTint) {
      lastTint = k;
      const c = new Color();
      for (const mesh of tiles as InstancedMesh[]) {
        (mesh.userData.items as CarpetItem[]).forEach((item, i) => mesh.setColorAt(i, c.setRGB(1 + (item.tint[0] - 1) * k, 1 + (item.tint[1] - 1) * k, 1 + (item.tint[2] - 1) * k)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    const nu = network ? localU(network, t) : 0;
    if (network && t >= network.start) scale *= 1 - smoothstep(0, 0.1, nu);
    carpet.scale.setScalar(Math.max(scale, 1e-4));
    carpet.visible = t < ending.start && !(network && t >= network.start + 0.1 * (network.end - network.start));

    networkGroup.visible = !!network && t >= network.start && t < ending.start;
    if (network && networkGroup.visible) {
      core.scale.setScalar(smoothstep(0.02, 0.12, nu));
      for (const mesh of nodeMeshes as InstancedMesh[]) {
        (mesh.userData.items as NodeItem[]).forEach((item, i) => {
          const s = item.radius * smoothstep(item.delay, item.delay + 0.12, nu);
          mesh.setMatrixAt(i, m.compose(v.set(...item.pos), q, new Vector3(s, s, s)));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      (edges.material as LineBasicMaterial).opacity = 0.5 * smoothstep(0.1, 0.5, nu);
      const late = smoothstep(0.4, 0.7, nu);
      (starEdges.material as LineBasicMaterial).opacity = 0.35 * late;
      (stars.material as PointsMaterial).opacity = late;
      (highlights.material as PointsMaterial).opacity = late;
      networkGroup.rotation.y = 0.06 * (t - network.start);
    }

    cardGroup.visible = t >= ending.start;
    const eu = localU(ending, t);
    const a = smoothstep(0, 0.35, eu);
    cardMaterial.opacity = a;
    card.position.y = -0.25 * (1 - a);
    taglineMaterial.opacity = smoothstep(0.25, 0.55, eu);
  };
  update(0);
  return { group, update, blackoutAt };
}
