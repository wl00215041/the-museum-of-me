import { Group, Mesh, Vector3, type Material } from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mulberry32 } from '../../util/rng';

type P = [number, number, number];

/** An octagonal section across x: the side of a bar that runs along x, corners cut by `b`. */
function sectionX(x: number, y0: number, y1: number, z0: number, z1: number, b: number): P[] {
  return [
    [x, y0 + b, z0], [x, y0, z0 + b], [x, y0, z1 - b], [x, y0 + b, z1],
    [x, y1 - b, z1], [x, y1, z1 - b], [x, y1, z0 + b], [x, y1 - b, z0],
  ];
}

/** A horizontal ring at height y (for the thumb, which rises along y). */
function ringY(cx: number, y: number, cz: number, rx: number, rz: number, n = 7, phase = 0): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), y, cz + rz * Math.sin(a)] as P;
  });
}

/**
 * Low-poly "like" hand, as in the original (95–111 s): the back of the hand lies along −x and slopes up to
 * the thumb, the thumb rises in the middle, four curled fingers are stacked on +x with rounded ends.
 * Each part is the convex hull of slightly jittered points, so every face is a flat facet.
 * About 2.85 m tall and 3.9 m long, resting on y = 0; the knuckles face +z.
 */
export function createThumbSculpture(material: Material, seed: number): Group {
  const rnd = mulberry32(seed);
  const group = new Group();
  group.name = 'thumb';
  const part = (name: string, points: P[], jitter = 0.035) => {
    const pts = points.map(([x, y, z]) => new Vector3(x + (rnd() - 0.5) * jitter, Math.max(0, y + (rnd() - 0.5) * jitter), z + (rnd() - 0.5) * jitter));
    const mesh = new Mesh(new ConvexGeometry(pts), material);
    mesh.name = name;
    group.add(mesh);
  };

  // Back of the hand and wrist: low at the wrist, rising to the base of the thumb.
  part('hand-back', [
    ...sectionX(-2.4, 0, 1.12, -0.56, 0.56, 0.2),
    ...sectionX(-1.9, 0, 1.3, -0.64, 0.64, 0.22),
    ...sectionX(-1.1, 0, 1.62, -0.72, 0.72, 0.24),
    ...sectionX(0.1, 0, 1.92, -0.8, 0.78, 0.26),
    ...sectionX(0.5, 0.08, 1.8, -0.74, 0.7, 0.3),
  ]);

  // Thumb: a broad lower segment from the top of the hand, then a slimmer tip leaning slightly forward.
  part('hand-thumb', [
    ...ringY(-0.05, 1.62, 0.02, 0.55, 0.42, 8),
    ...ringY(0.02, 1.95, 0.02, 0.46, 0.38, 8, 0.3),
    ...ringY(0.1, 2.3, 0.04, 0.33, 0.31, 7),
  ]);
  part('hand-thumb', [
    ...ringY(0.1, 2.24, 0.04, 0.32, 0.3, 7, 0.2),
    ...ringY(0.16, 2.62, 0.06, 0.27, 0.26, 7),
    ...ringY(0.19, 2.8, 0.07, 0.15, 0.14, 5, 0.4),
    [0.2, 2.85, 0.07],
  ]);

  // Four curled fingers, stacked top to bottom: short, thick and blunt, each with a rounded knuckle towards +x.
  const fingers: [number, number, number][] = [
    [1.44, 1.9, 1.3],
    [1.0, 1.42, 1.33],
    [0.58, 0.98, 1.27],
    [0.18, 0.56, 1.12],
  ];
  for (const [y0, y1, end] of fingers) {
    const h = y1 - y0;
    part('hand-finger', [
      ...sectionX(0.3, y0, y1, -0.68, 0.64, 0.1),
      ...sectionX(end - 0.34, y0, y1 + 0.02, -0.68, 0.66, 0.12),
      ...sectionX(end - 0.14, y0 + 0.04, y1 - 0.03, -0.64, 0.62, h * 0.32),
      ...sectionX(end, y0 + h * 0.2, y1 - h * 0.22, -0.54, 0.52, h * 0.22),
    ], 0.03);
  }
  return group;
}
