import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, SphereGeometry, Vector3, type Material } from 'three';
import type { VisitorSpot } from '../placement';
import { CHARACTERS, type Character, type HairStyle, type Pose } from './characters';

export interface VisitorMaterials {
  silhouette: Material;
  /** Matte dielectric (fabric, skin, hair); cached per colour and roughness. */
  fabric(color: number, roughness: number): Material;
}

/** One horizontal cross-section of a lofted part: a superellipse of half-widths rx (x) and rz (z) centred at (x, z). */
interface Ring {
  y: number;
  rx: number;
  rz: number;
  x?: number;
  z?: number;
  /** Superellipse exponent: 2 is an ellipse, larger is squarer. */
  p?: number;
  /** Raises the front of the ring and lowers the back by this much (hairlines, hems). */
  tilt?: number;
}

type V3 = [number, number, number];

/** A closed surface through `rings` (bottom to top), with optional flat caps at either end. Normals face outward. */
function loft(rings: Ring[], seg: number, caps: [boolean, boolean] = [true, true]): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of rings) {
    const e = 2 / (r.p ?? 2);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sx = Math.sign(c) * Math.abs(c) ** e;
      const sz = Math.sign(s) * Math.abs(s) ** e;
      pos.push((r.x ?? 0) + r.rx * sx, r.y + (r.tilt ?? 0) * s, (r.z ?? 0) + r.rz * sz);
    }
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      idx.push(a, a + seg, b, b, a + seg, b + seg);
    }
  }
  const cap = (ring: number, top: boolean) => {
    const r = rings[ring];
    const centre = pos.length / 3;
    pos.push(r.x ?? 0, r.y, r.z ?? 0);
    for (let j = 0; j < seg; j++) {
      const a = ring * seg + j;
      const b = ring * seg + ((j + 1) % seg);
      if (top) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  };
  if (caps[0]) cap(0, false);
  if (caps[1]) cap(rings.length - 1, true);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A limb segment from a to b with rounded ends: radius r0 at a, r1 at b, a muscle belly `bulge` near a, and depth/width ratio `flat`. */
function limb(r0: number, r1: number, length: number, o: { bulge?: number; flat?: number; seg?: number } = {}): BufferGeometry {
  const f = o.flat ?? 1;
  const belly = ((r0 + r1) / 2) * (o.bulge ?? 1);
  const ring = (y: number, r: number): Ring => ({ y, rx: r, rz: r * f });
  return loft(
    [ring(-0.55 * r0, 0.45 * r0), ring(-0.25 * r0, 0.88 * r0), ring(0, r0), ring(length * 0.35, Math.max(belly, r1)), ring(length, r1), ring(length + 0.25 * r1, 0.88 * r1), ring(length + 0.5 * r1, 0.45 * r1)],
    o.seg ?? 12,
  );
}

const UP = new Vector3(0, 1, 0);

/** Orients a +Y-built part so it runs from a towards b. */
function between(mesh: Mesh, a: V3, b: V3): Mesh {
  const dir = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  mesh.position.set(...a);
  mesh.quaternion.setFromUnitVectors(UP, dir);
  return mesh;
}

const dist = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Joint positions of the reference male (1.80 m), facing +Z with his left at +X. */
interface Joints {
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  /** Fingertips. */
  tip: V3;
}

/** Right-arm joints per pose, as [right, left]; x < 0 is the figure's right. */
const POSES: Record<Pose, [Joints, Joints]> = {
  down: [
    { shoulder: [-0.172, 1.415, 0], elbow: [-0.215, 1.11, -0.02], wrist: [-0.235, 0.855, 0.01], tip: [-0.235, 0.69, 0.03] },
    { shoulder: [0.172, 1.415, 0], elbow: [0.215, 1.11, -0.02], wrist: [0.235, 0.855, 0.01], tip: [0.235, 0.69, 0.03] },
  ],
  // Forearms folded across the lower chest, the right under the left; each hand tucked at the other arm (original 33 s, 44 s).
  crossed: [
    { shoulder: [-0.172, 1.415, 0], elbow: [-0.225, 1.16, 0.07], wrist: [0.1, 1.19, 0.19], tip: [0.2, 1.24, 0.12] },
    { shoulder: [0.172, 1.415, 0], elbow: [0.225, 1.2, 0.07], wrist: [-0.1, 1.25, 0.23], tip: [-0.21, 1.29, 0.13] },
  ],
  // Right hand at the chin, its elbow resting on the left forearm (original 44–52 s).
  handToFace: [
    { shoulder: [-0.172, 1.415, 0], elbow: [-0.2, 1.15, 0.14], wrist: [-0.07, 1.46, 0.15], tip: [-0.04, 1.6, 0.1] },
    { shoulder: [0.172, 1.415, 0], elbow: [0.215, 1.12, 0.03], wrist: [-0.08, 1.12, 0.17], tip: [-0.2, 1.13, 0.16] },
  ],
};

interface Build {
  /** Reference standing height (crown) the tables below are drawn at. */
  height: number;
  /** Maps the male pose table onto this build. */
  map: V3;
  hip: V3;
  knee: V3;
  ankle: V3;
  chin: number;
  headScale: number;
  neck: number;
  arm: number;
  /** Pelvis (pants), bottom to top. */
  pelvis: Ring[];
  /** Torso from the waist to the base of the neck. */
  torso: Ring[];
  waist: number;
}

const BUILDS: Record<Character['build'], Build> = {
  male: {
    height: 1.8,
    map: [1, 1, 1],
    hip: [0.092, 0.93, 0],
    knee: [0.1, 0.5, 0.01],
    ankle: [0.105, 0.085, -0.01],
    chin: 1.555,
    headScale: 1,
    neck: 0.052,
    arm: 1,
    pelvis: [
      { y: 0.84, rx: 0.12, rz: 0.085 },
      { y: 0.9, rx: 0.165, rz: 0.108, z: -0.01 },
      { y: 0.97, rx: 0.172, rz: 0.112, z: -0.008 },
      { y: 1.03, rx: 0.162, rz: 0.105 },
      { y: 1.08, rx: 0.155, rz: 0.1 },
    ],
    torso: [
      { y: 1.04, rx: 0.16, rz: 0.104 },
      { y: 1.1, rx: 0.157, rz: 0.1 },
      { y: 1.2, rx: 0.165, rz: 0.108 },
      { y: 1.3, rx: 0.178, rz: 0.118, z: 0.01 },
      { y: 1.38, rx: 0.185, rz: 0.112, z: 0.005 },
      { y: 1.44, rx: 0.175, rz: 0.095, p: 2.6 },
      { y: 1.48, rx: 0.12, rz: 0.07 },
      { y: 1.51, rx: 0.065, rz: 0.055 },
    ],
    waist: 1.05,
  },
  female: {
    height: 1.66,
    map: [0.86, 0.922, 0.9],
    hip: [0.088, 0.86, 0],
    knee: [0.08, 0.47, 0.01],
    ankle: [0.075, 0.08, -0.01],
    chin: 1.432,
    headScale: 0.93,
    neck: 0.045,
    arm: 0.85,
    pelvis: [
      { y: 0.77, rx: 0.115, rz: 0.08 },
      { y: 0.83, rx: 0.168, rz: 0.108, z: -0.01 },
      { y: 0.89, rx: 0.178, rz: 0.115, z: -0.012 },
      { y: 0.95, rx: 0.155, rz: 0.1 },
      { y: 1.0, rx: 0.13, rz: 0.088 },
    ],
    torso: [
      { y: 0.97, rx: 0.14, rz: 0.093 },
      { y: 1.03, rx: 0.125, rz: 0.088 },
      { y: 1.1, rx: 0.132, rz: 0.095 },
      { y: 1.18, rx: 0.145, rz: 0.12, z: 0.015 },
      { y: 1.25, rx: 0.15, rz: 0.1 },
      { y: 1.32, rx: 0.15, rz: 0.085, p: 2.4 },
      { y: 1.36, rx: 0.1, rz: 0.06 },
      { y: 1.385, rx: 0.055, rz: 0.048 },
    ],
    waist: 0.97,
  },
};

/** Head, chin at y = 0, crown at 0.245 (reference male). */
const HEAD: Ring[] = [
  { y: 0, rx: 0.035, rz: 0.03, z: 0.03 },
  { y: 0.02, rx: 0.05, rz: 0.055, z: 0.02 },
  { y: 0.06, rx: 0.065, rz: 0.08, z: 0.005 },
  { y: 0.11, rx: 0.075, rz: 0.095, z: -0.005 },
  { y: 0.16, rx: 0.078, rz: 0.1, z: -0.01 },
  { y: 0.2, rx: 0.07, rz: 0.09, z: -0.015 },
  { y: 0.23, rx: 0.045, rz: 0.06, z: -0.015 },
  { y: 0.245, rx: 0.01, rz: 0.01, z: -0.015 },
];

/** Scalp hair: follows the skull, hairline high at the brow and low at the nape. */
function hairCap(bottom: number, tilt: number, lift = 0.01): BufferGeometry {
  return loft(
    [
      { y: bottom, rx: 0.081, rz: 0.1, z: -0.008, tilt },
      { y: 0.16, rx: 0.086, rz: 0.108, z: -0.012, tilt: tilt * 0.4 },
      { y: 0.2 + lift * 0.5, rx: 0.078, rz: 0.099, z: -0.017 },
      { y: 0.232 + lift, rx: 0.052, rz: 0.068, z: -0.017 },
      { y: 0.25 + lift, rx: 0.012, rz: 0.012, z: -0.017 },
    ],
    18,
    [false, true],
  );
}

/** Hair hanging behind the head to `end` (head-local y; below the chin is negative). */
function hairHang(end: number): BufferGeometry {
  const rings: Ring[] = [];
  if (end < -0.12) rings.push({ y: end, rx: 0.07, rz: 0.02, z: -0.13, tilt: 0.02 }, { y: (end - 0.1) / 2, rx: 0.088, rz: 0.03, z: -0.12 });
  else rings.push({ y: end, rx: 0.085, rz: 0.035, z: -0.075, tilt: 0.015 });
  rings.push(
    { y: -0.03, rx: 0.092, rz: 0.05, z: -0.065 },
    { y: 0.03, rx: 0.09, rz: 0.065, z: -0.045 },
    { y: 0.1, rx: 0.087, rz: 0.088, z: -0.022 },
    { y: 0.17, rx: 0.084, rz: 0.1, z: -0.015 },
  );
  return loft(rings, 18);
}

/** A standing gallery visitor built from its character sheet, facing local +Z; dark rooms show it as a silhouette. */
export function createVisitor(spot: VisitorSpot, m: VisitorMaterials): Group {
  const ch = CHARACTERS[spot.character];
  const B = BUILDS[ch.build];
  const C = ch.colors;
  const mat = (color: number, roughness = 0.9) => (spot.dark ? m.silhouette : m.fabric(color, roughness));
  const skin = mat(C.skin, 0.6);
  const hair = mat(C.hair, 0.5);
  const top = mat(C.top, 0.9);
  const denim = mat(C.bottom, 0.78);
  const mesh = (geometry: BufferGeometry, material: Material, name = '') => Object.assign(new Mesh(geometry, material), { name });
  const named = (name: string, ...children: Mesh[]) => {
    const g = new Group();
    g.name = name;
    g.add(...children);
    return g;
  };
  const scale = ch.height / B.height;
  // Heels lift everything above the shoes.
  const lift = ch.heels ? 0.045 : 0;
  const map = (p: V3): V3 => [p[0] * B.map[0], p[1] * B.map[1] + lift, p[2] * B.map[2]];

  const body = new Group();
  body.name = 'body';

  // Head, ears, nose.
  const head = named('head', mesh(loft(HEAD, 18), skin));
  for (const s of [-1, 1]) {
    const ear = mesh(new SphereGeometry(1, 8, 6), skin);
    ear.position.set(s * 0.076, 0.115, -0.005);
    ear.scale.set(0.012, 0.03, 0.02);
    head.add(ear);
  }
  const nose = mesh(new ConeGeometry(0.013, 0.04, 6), skin);
  nose.position.set(0, 0.1, 0.098);
  nose.rotation.x = Math.PI / 2 + 0.35;
  head.add(nose);
  head.add(createHair(ch.hair, hair, mesh));
  head.position.set(0, B.chin + lift, 0);
  head.scale.setScalar(B.headScale);
  body.add(head);

  const neckTop: V3 = [0, B.chin + lift + 0.04, 0];
  const neckBase: V3 = [0, B.torso[B.torso.length - 1].y + lift - 0.04, -0.01];
  body.add(between(mesh(limb(B.neck, B.neck * 0.95, dist(neckBase, neckTop), { seg: 12 }), skin, 'neck'), neckBase, neckTop));

  // Torso, and the hips inside the trousers.
  const at = (rings: Ring[], dx = 0) => rings.map((r) => ({ ...r, y: r.y + lift, rx: r.rx + dx, rz: r.rz + dx }));
  const loose = ch.top === 'shirt' ? 0.01 : ch.top === 'blazer' ? 0.008 : 0;
  const torsoRings = at(B.torso, loose);
  if (ch.top === 'fitted') torsoRings.unshift({ ...torsoRings[0], y: B.pelvis[2].y + lift, rx: B.pelvis[2].rx + 0.006, rz: B.pelvis[2].rz + 0.006, z: B.pelvis[2].z });
  if (ch.top === 'blazer') for (const r of torsoRings) if (r.y > B.torso[4].y + lift - 0.01 && r.y < B.torso[6].y + lift) r.p = 2.8;
  body.add(mesh(loft(torsoRings, 20), top, 'torso'));
  if (ch.top !== 'dress') body.add(mesh(loft(at(B.pelvis), 20), denim, 'pelvis'));
  if (C.belt !== undefined) {
    const w = B.waist + lift;
    const band = [0.012, 0.012].map((d, i) => ({ ...B.pelvis[3], y: w + (i ? 0.02 : -0.02), rx: B.pelvis[3].rx + d, rz: B.pelvis[3].rz + d }));
    body.add(mesh(loft(band, 20), mat(C.belt, 0.6), 'belt'));
  }
  if (ch.top === 'blazer') {
    // The blazer's skirt to the upper thigh, and its raised collar.
    const y = (v: number) => v + lift;
    const tail: Ring[] = [
      { y: y(0.74), rx: 0.186, rz: 0.124, z: -0.006, tilt: -0.01 },
      { y: y(0.85), rx: 0.183, rz: 0.122, z: -0.006 },
      { y: y(0.97), rx: 0.18, rz: 0.118, z: -0.004 },
      { y: y(1.06), rx: 0.17, rz: 0.11 },
      { y: y(1.12), rx: 0.166, rz: 0.108 },
    ];
    body.add(mesh(loft(tail, 20, [false, false]), top, 'blazer'));
    const collar: Ring[] = [
      { y: y(1.46), rx: 0.085, rz: 0.075, z: -0.012 },
      { y: y(1.53), rx: 0.068, rz: 0.062, z: -0.02 },
    ];
    body.add(mesh(loft(collar, 16, [false, false]), top, 'collar'));
  }
  if (ch.top === 'dress') {
    // Gathered waist, then a bell-flared skirt widest at the knee-length hem (original 38 s).
    const y = (v: number) => v + lift;
    const skirt: Ring[] = [
      { y: y(0.5), rx: 0.305, rz: 0.245, z: -0.02, tilt: 0.01 },
      { y: y(0.56), rx: 0.3, rz: 0.24, z: -0.02 },
      { y: y(0.68), rx: 0.272, rz: 0.215, z: -0.018 },
      { y: y(0.8), rx: 0.235, rz: 0.185, z: -0.015 },
      { y: y(0.9), rx: 0.19, rz: 0.14, z: -0.01 },
      { y: y(0.95), rx: 0.142, rz: 0.1 },
      { y: y(1.0), rx: 0.136, rz: 0.095 },
    ];
    body.add(mesh(loft(skirt, 24, [false, false]), top, 'skirt'));
    const sash = [0, 1].map((i) => ({ y: y(0.955 + i * 0.03), rx: 0.147, rz: 0.104 }));
    body.add(mesh(loft(sash, 20, [false, false]), mat(C.belt ?? C.top, 0.85), 'sash'));
  }
  if (ch.top !== 'dress' && ch.top !== 'blazer') {
    // Back pockets of the jeans, a shade darker than the denim.
    const P = B.pelvis[2];
    for (const s of [-1, 1]) {
      const pocket = mesh(new BoxGeometry(0.095, 0.105, 0.008), mat(darken(C.bottom, 0.93), 0.8));
      pocket.position.set(s * P.rx * 0.42, P.y + lift + 0.015, (P.z ?? 0) - P.rz * 0.97);
      pocket.rotation.set(0.1, s * 0.4, 0);
      body.add(pocket);
    }
  }

  // Arms: sleeves in the top's colour (a short cap sleeve on the dress), bare hands.
  const pose = POSES[ch.pose];
  (['r', 'l'] as const).forEach((side, i) => {
    const J = pose[i];
    const [sh, el, wr, tip] = [map(J.shoulder), map(J.elbow), map(J.wrist), map(J.tip)];
    const k = B.arm;
    const sleeve = ch.top === 'dress' ? skin : top;
    const bulk = ch.top === 'blazer' ? 1.12 : ch.top === 'shirt' ? 1.08 : 1;
    const arm = named(
      `arm-${side}`,
      between(mesh(limb(0.056 * k * bulk, 0.041 * k * bulk, dist(sh, el), { bulge: 1.05 }), sleeve, 'upper-arm'), sh, el),
      between(mesh(limb(0.043 * k * bulk, 0.031 * k * bulk, dist(el, wr), { bulge: 1.1, flat: 0.85 }), sleeve, 'forearm'), el, wr),
    );
    if (ch.top === 'dress') arm.add(between(mesh(limb(0.062 * k, 0.052 * k, dist(sh, el) * 0.35), top, 'sleeve'), sh, lerp3(sh, el, 0.35)));
    // A flat mitten: thin across (x), wide front to back (z) for a hand hanging at the side.
    const hand = named(`hand-${side}`, between(mesh(limb(0.016 * k, 0.012 * k, dist(wr, tip) * 0.85, { flat: 2.6, seg: 10 }), skin), wr, tip));
    arm.add(hand);
    body.add(arm);
  });

  // Legs: jeans (straight or skinny) or bare legs under the dress.
  (['r', 'l'] as const).forEach((side) => {
    const s = side === 'l' ? 1 : -1;
    const hip: V3 = [s * B.hip[0], B.hip[1] + lift, B.hip[2]];
    const knee: V3 = [s * B.knee[0], B.knee[1] + lift, B.knee[2]];
    const ankle: V3 = [s * B.ankle[0], B.ankle[1] + lift, B.ankle[2]];
    const bare = ch.bareLegs === true;
    const legMat = bare ? skin : denim;
    const w = bare ? 0.82 : ch.skinny ? 0.86 : ch.build === 'female' ? 0.92 : 1;
    const leg = named(
      `leg-${side}`,
      between(mesh(limb(0.088 * w, 0.058 * w, dist(hip, knee), { bulge: 1.05 }), legMat, 'thigh'), hip, knee),
      between(mesh(limb(0.056 * w, bare ? 0.03 : 0.045 * w, dist(knee, ankle), { bulge: bare ? 1.25 : 1 }), legMat, 'shin'), knee, ankle),
    );
    body.add(leg);
    body.add(createShoe(side, s * B.ankle[0], ch, mat(C.shoes, 0.55), mesh));
  });

  body.scale.setScalar(scale);
  const group = new Group();
  group.name = 'visitor';
  group.add(body);
  group.scale.setScalar(spot.scale);
  group.position.set(...spot.pos);
  group.rotation.y = spot.yaw;
  return group;
}

type MeshFn = (geometry: BufferGeometry, material: Material, name?: string) => Mesh;

function createHair(style: HairStyle, material: Material, mesh: MeshFn): Group {
  const hair = new Group();
  hair.name = 'hair';
  const tilt = style === 'short' ? 0.06 : 0.05;
  hair.add(mesh(hairCap(style === 'short' ? 0.11 : 0.12, tilt, style === 'short' ? 0.012 : 0.006), material));
  if (style === 'shoulder') hair.add(mesh(hairHang(-0.07), material));
  if (style === 'long') hair.add(mesh(hairHang(-0.3), material));
  if (style === 'ponytail') {
    // Low ponytail from the occiput to the upper back (original 33 s).
    const from: V3 = [0, 0.12, -0.1];
    const to: V3 = [0, -0.12, -0.145];
    const tail = between(mesh(limb(0.026, 0.012, dist(from, to), { bulge: 1.15, flat: 0.8, seg: 10 }), material, 'hair-ponytail'), from, to);
    hair.add(tail);
  }
  if (style === 'bun') {
    const bun = mesh(new SphereGeometry(1, 14, 10), material, 'hair-bun');
    bun.position.set(0, 0.235, -0.065);
    bun.scale.set(0.05, 0.043, 0.047);
    hair.add(bun);
  }
  return hair;
}

/** A shoe under the ankle; heels tilt the foot and add a heel post. */
function createShoe(side: 'l' | 'r', x: number, ch: Character, material: Material, mesh: MeshFn): Group {
  const shoe = new Group();
  shoe.name = `shoe-${side}`;
  const width = ch.build === 'female' ? 0.036 : 0.046;
  const length = ch.build === 'female' ? 0.24 : 0.28;
  const heel: V3 = ch.heels ? [x, 0.1, -0.06] : [x, 0.045, -0.065];
  const toe: V3 = [x, ch.heels ? 0.03 : 0.045, -0.065 + length * 0.97];
  // Sole kept flat: each section is offset so its bottom stays on the line heel→toe.
  const R = ch.heels ? 0.028 : 0.045;
  const section = (y: number, rx: number, rz: number): Ring => ({ y, rx, rz, z: R - rz, p: 2.6 });
  const L = dist(heel, toe);
  shoe.add(
    between(
      mesh(loft([section(-0.01, width * 0.7, R * 0.7), section(0.02, width * 0.95, R), section(L * 0.45, width, R * 0.95), section(L * 0.75, width * 1.02, R * 0.72), section(L * 0.95, width * 0.75, R * 0.45), section(L + 0.01, width * 0.35, R * 0.3)], 12), material),
      heel,
      toe,
    ),
  );
  if (ch.heels) {
    const post = mesh(new CylinderGeometry(0.011, 0.014, 0.075, 8), material);
    post.position.set(x, 0.0375, -0.055);
    shoe.add(post);
  }
  return shoe;
}

function darken(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 255) * k);
  const g = Math.round(((color >> 8) & 255) * k);
  const b = Math.round((color & 255) * k);
  return (r << 16) | (g << 8) | b;
}
