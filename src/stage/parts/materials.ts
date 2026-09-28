import { LineBasicMaterial, MeshStandardMaterial, type Material, type Texture } from 'three';
import { createAtlasMaterial } from './atlas-mesh';
import type { VisitorMaterials } from './visitor';

export interface StageMaterials {
  wall: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  skirting: MeshStandardMaterial;
  darkFloor: MeshStandardMaterial;
  darkWall: MeshStandardMaterial;
  blockSide: MeshStandardMaterial;
  plaque: MeshStandardMaterial;
  platform: MeshStandardMaterial;
  lightboxFrame: MeshStandardMaterial;
  monitorBody: MeshStandardMaterial;
  pedestal: MeshStandardMaterial;
  pillarDark: MeshStandardMaterial;
  pillarLight: MeshStandardMaterial;
  crtBody: MeshStandardMaterial;
  crtStand: MeshStandardMaterial;
  sculpture: MeshStandardMaterial;
  robot: { shell: MeshStandardMaterial; joint: MeshStandardMaterial; accent: MeshStandardMaterial };
  visitor: VisitorMaterials;
  nodeLine: LineBasicMaterial;
  starLine: LineBasicMaterial;
  /** Cached atlas material per (atlas texture, lit, double-sided). */
  atlas(texture: Texture, lit: boolean, doubleSide?: boolean): Material;
  dispose(): void;
}

export function createStageMaterials(): StageMaterials {
  const std = (color: number, roughness: number, extra: Partial<{ metalness: number; flatShading: boolean }> = {}) =>
    new MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const robot = { shell: std(0xe6e6e3, 0.45), joint: std(0x1b1b1d, 0.5), accent: std(0x6d6f73, 0.35, { metalness: 0.6 }) };
  const fabrics = new Map<string, MeshStandardMaterial>();
  const silhouette = std(0x060606, 1);
  const visitor: VisitorMaterials = {
    silhouette,
    fabric(color, roughness) {
      const key = `${color}:${roughness}`;
      let m = fabrics.get(key);
      if (!m) {
        m = std(color, roughness);
        fabrics.set(key, m);
      }
      return m;
    },
  };
  const shared = {
    wall: std(0xd9d8d4, 0.95),
    floor: std(0xcfccc5, 0.5),
    skirting: std(0xd9d7d1, 0.8),
    darkFloor: std(0x101010, 0.7, { metalness: 0.15 }),
    darkWall: std(0x161616, 1),
    blockSide: std(0x2b2b2b, 0.8),
    plaque: std(0xf7f7f5, 0.9),
    platform: std(0xdcdad4, 0.8),
    lightboxFrame: std(0x151515, 0.6),
    monitorBody: std(0x101010, 0.5),
    pedestal: std(0x161616, 0.85),
    pillarDark: std(0x1a1a1a, 0.9),
    pillarLight: std(0xc4c3bf, 0.9),
    crtBody: std(0x2b2926, 0.55),
    crtStand: std(0x111111, 0.6),
    sculpture: std(0x6e6e6e, 0.85, { flatShading: true }),
  };
  const nodeLine = new LineBasicMaterial({ color: 0x9aa7b8, transparent: true, opacity: 0.5 });
  const starLine = new LineBasicMaterial({ color: 0x3b6fb6, transparent: true, opacity: 0.35 });
  const atlasCache = new Map<string, Material>();
  const all: Material[] = [...Object.values(shared), ...Object.values(robot), silhouette, nodeLine, starLine];
  return {
    ...shared,
    robot,
    visitor,
    nodeLine,
    starLine,
    atlas(texture, lit, doubleSide = false) {
      const key = `${texture.uuid}:${lit}:${doubleSide}`;
      let m = atlasCache.get(key);
      if (!m) {
        m = createAtlasMaterial(texture, lit, doubleSide);
        atlasCache.set(key, m);
      }
      return m;
    },
    dispose() {
      all.forEach((m) => m.dispose());
      atlasCache.forEach((m) => m.dispose());
      atlasCache.clear();
      fabrics.forEach((m) => m.dispose());
      fabrics.clear();
    },
  };
}
