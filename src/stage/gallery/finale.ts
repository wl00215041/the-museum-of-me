import {
  AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, SphereGeometry, Vector3, Euler, type InstancedMesh, type Material,
} from 'three';
import { findSegment, localU, requireSegment } from '../../plan/sequence';
import type { Vec3 } from '../../types';
import { clamp, lerp, smoothstep } from '../../util/math';
import { mulberry32 } from '../../util/rng';
import { placeIn } from '../frame';
import { CARPET } from '../gallery';
import { buildAtlasInstances, createAtlasMaterial, type AtlasInstance } from '../parts/atlas-mesh';
import { cropTexture } from '../parts/canvas-block';
import { textUnits } from '../parts/led';
import { createTextPlane } from '../parts/text-plane';
import { hiresOf, type GalleryContext, type RoomObject } from './context';

/** Multiplier that brings a photo's average colour to the cell colour (softened, clamped). */
const tintOf = (cell: number, photo: number) => 1 + (clamp(cell / Math.max(photo, 0.04), 0, 3) - 1) * 0.9;

type CarpetItem = AtlasInstance & { tint: [number, number, number]; base: [number, number]; lie: { dy: number; ax: number; az: number } };
type NodeItem = AtlasInstance & { pos: Vec3; radius: number; delay: number };

export function buildFinale(ctx: GalleryContext): RoomObject & { blackoutAt(t: number): number } {
  const { sequence, gallery, content, tex, mats } = ctx;
  const lib = content.library;
  const fin = gallery.finale;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const d = dive.end - dive.start;
  const group = placeIn(fin.frame, new Group());
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
  blackout.position.set(fin.lifted[0], fin.lifted[1], fin.lifted[2]);
  blackout.visible = false;
  const blackoutAt = (t: number) => smoothstep(dive.start + 0.6 * d, dive.end, t);

  // Carpet = the mosaic, laid out on the platform from the start.
  const { cols, rows, pitch, tile } = CARPET;
  const carpet = new Group();
  carpet.name = 'carpet';
  carpet.position.set(fin.carpet[0], fin.carpet[1], fin.carpet[2]);
  const { colors, assignment } = content.mosaic;
  // The photos lie unevenly on the platform, a few propped up (original 147–159 s); they settle flat as the carpet lifts.
  const scatter = mulberry32(97);
  const qc = new Quaternion();
  const e = new Euler();
  const lieMatrix = (item: Pick<CarpetItem, 'base' | 'lie'>, f: number, out = new Matrix4()) =>
    out.compose(new Vector3(item.base[0], item.lie.dy * f, item.base[1]), qc.setFromEuler(e.set(item.lie.ax * f, 0, item.lie.az * f)), new Vector3(1, 1, 1));
  const items: CarpetItem[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const photo = assignment[i];
      const pc = lib.colors[photo];
      const propped = scatter() < 0.08;
      const angle = propped ? lerp(0.3, 0.6, scatter()) * (scatter() < 0.5 ? -1 : 1) : (scatter() - 0.5) * 0.1;
      const aroundX = scatter() < 0.5;
      const lie = { dy: propped ? Math.abs(Math.sin(angle)) * (tile / 2) : scatter() * 0.025, ax: aroundX ? angle : 0, az: aroundX ? 0 : angle };
      const base: [number, number] = [(c - (cols - 1) / 2) * pitch, (r - (rows - 1) / 2) * pitch];
      items.push({
        photoIndex: photo,
        base,
        lie,
        matrix: lieMatrix({ base, lie }, 1),
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
  const portrait = hiresOf(content, gallery.portraitIndex);
  const overlayMaterial = owned(
    new MeshBasicMaterial({ map: cropTexture(portrait, lib.aspects[gallery.portraitIndex], cols / rows), transparent: true, opacity: 0, depthWrite: false }),
    true,
  );
  const overlay = new Mesh(new PlaneGeometry(cols * pitch, rows * pitch).rotateX(-Math.PI / 2), overlayMaterial);
  overlay.name = 'mosaic-overlay';
  overlay.position.y = 0.004;
  overlay.renderOrder = 11;
  carpet.add(overlay);

  // Network around the lifted portrait.
  const net = fin.network;
  const networkGroup = new Group();
  networkGroup.name = 'network';
  networkGroup.position.set(fin.lifted[0], fin.lifted[1], fin.lifted[2]);
  networkGroup.visible = false;
  const core = new Mesh(new SphereGeometry(0.55, 48, 32), owned(new MeshBasicMaterial({ map: portrait })));
  core.name = 'network-core';
  core.scale.setScalar(0);
  networkGroup.add(core);
  // Bubbles on a spoke appear as their spoke arrives; the others grow outwards afterwards.
  const arrive = new Map<number, number>();
  net.edges
    .filter(([a]) => a === -1)
    .map(([, b]) => ({ b, d: Math.hypot(...net.nodes[b].pos) }))
    .sort((x, y) => x.d - y.d)
    .forEach(({ b }, rank, all) => arrive.set(b, 0.06 + (0.1 * rank) / Math.max(1, all.length - 1)));
  const order = net.nodes.map((n, i) => ({ i, d: Math.hypot(...n.pos) })).filter(({ i }) => !arrive.has(i)).sort((a, b) => a.d - b.d);
  const delays = new Array<number>(net.nodes.length);
  for (const [i, t] of arrive) delays[i] = t - 0.02;
  order.forEach(({ i }, rank) => { delays[i] = 0.15 + (0.35 * rank) / Math.max(1, order.length - 1); });
  const nodeItems: NodeItem[] = net.nodes.map((n, i) => ({
    photoIndex: n.photoIndex, matrix: new Matrix4().makeScale(0, 0, 0), pos: n.pos, radius: n.radius, delay: delays[i],
  }));
  const nodeMeshes = nodeItems.length
    ? buildAtlasInstances({ geometry: new SphereGeometry(1, 20, 14), library: lib, items: nodeItems, material: (a) => mats.atlas(lib.atlases[a], false), rect: 'square' })
    : [];
  for (const mesh of nodeMeshes) {
    mesh.name = 'network-nodes';
    mesh.frustumCulled = false; // its bounding sphere was computed at scale 0
    networkGroup.add(mesh);
  }
  const lines = (positions: number[], color: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // Transparent lines must not write depth: at opacity 0 they would still cut through the carpet (review I1).
    return new LineSegments(geometry, owned(new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })));
  };
  const posOf = (i: number): Vec3 => (i < 0 ? [0, 0, 0] : net.nodes[i].pos);
  // Spokes shoot out of the portrait first (original 174–175 s); the web between the bubbles comes after.
  const spokeEdges = net.edges.filter(([a]) => a === -1);
  const edges = lines(net.edges.filter(([a]) => a !== -1).flatMap(([a, b]) => [...posOf(a), ...posOf(b)]), 0x9aa7b8);
  edges.name = 'network-edges';
  const spokes = lines(new Array(spokeEdges.length * 6).fill(0), 0x7fb4e0);
  spokes.name = 'network-spokes';
  spokes.frustumCulled = false;
  const spokeDirs = spokeEdges.map(([, b]) => new Vector3(...net.nodes[b].pos).normalize());
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
  const sparks = points(spokeDirs.flatMap((d) => [d.x * 0.57, d.y * 0.57, d.z * 0.57]), 0.07, 0x4ad0ff, 'network-sparks');
  core.add(sparks);
  networkGroup.add(edges, spokes, starEdges, stars, highlights);

  // End card, far below, framed by the fixed ending camera.
  const cardGroup = new Group();
  cardGroup.position.set(fin.card[0], fin.card[1], fin.card[2]);
  cardGroup.visible = false;
  const name = content.name.toUpperCase();
  const cardTexture = tex.text({
    size: { width: 1760, height: 1080 },
    background: '#f4f4f2',
    align: 'left',
    padding: 150,
    lineGap: 0.12,
    lines: [
      { text: 'The Museum of Me', px: 84, weight: 700, family: 'serif', color: '#1d1d1d' },
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

  const carpetFrom = new Vector3(...fin.carpet);
  const carpetTo = new Vector3(...fin.lifted);
  let lastTint = -1;
  let lastLie = -1;
  const lm = new Matrix4();
  const q = new Quaternion();
  const m = new Matrix4();
  const v = new Vector3();
  const s3 = new Vector3();

  const update = (t: number) => {
    const b = blackoutAt(t);
    blackout.visible = b > 0 && t < dive.end;
    blackoutMaterial.opacity = b;

    const mu = localU(mosaic, t);
    const lift = smoothstep(0, 0.4, mu);
    carpet.position.lerpVectors(carpetFrom, carpetTo, lift);
    // Starts in line with the platform, then untwists as it lifts (original 160–175 s).
    carpet.rotation.set(-0.35 * lift, fin.carpetYaw * (1 - lift) + 0.25 * lift + 0.12 * mu, 0);
    const lie = 1 - smoothstep(0, 0.35, mu);
    if (lie !== lastLie) {
      lastLie = lie;
      for (const mesh of tiles as InstancedMesh[]) {
        (mesh.userData.items as CarpetItem[]).forEach((item, i) => mesh.setMatrixAt(i, lieMatrix(item, lie, lm)));
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
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
          mesh.setMatrixAt(i, m.compose(v.set(...item.pos), q, s3.set(s, s, s)));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      const cs = core.scale.x;
      const sp = spokes.geometry.getAttribute('position');
      spokeEdges.forEach(([, b], k) => {
        const d = spokeDirs[k];
        const [x, y, z] = net.nodes[b].pos;
        const f = smoothstep(0.02, arrive.get(b)!, nu);
        const r0 = 0.55 * cs;
        sp.setXYZ(2 * k, d.x * r0, d.y * r0, d.z * r0);
        sp.setXYZ(2 * k + 1, d.x * r0 + (x - d.x * r0) * f, d.y * r0 + (y - d.y * r0) * f, d.z * r0 + (z - d.z * r0) * f);
      });
      sp.needsUpdate = true;
      (spokes.material as LineBasicMaterial).opacity = 0.75 * smoothstep(0.015, 0.03, nu);
      (sparks.material as PointsMaterial).opacity = smoothstep(0.02, 0.06, nu);
      (edges.material as LineBasicMaterial).opacity = 0.5 * smoothstep(0.2, 0.5, nu);
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
