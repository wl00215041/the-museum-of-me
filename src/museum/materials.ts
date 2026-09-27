import { AdditiveBlending, LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial, type Texture } from 'three';

export interface Materials {
  wall: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  skylight: MeshBasicMaterial;
  frame: MeshStandardMaterial;
  mat: MeshStandardMaterial;
  visitor: MeshStandardMaterial;
  thread: LineBasicMaterial;
  edge: LineBasicMaterial;
  glow: MeshBasicMaterial;
  /** One unlit material per photo texture, shared by every frame showing it. */
  photo(texture: Texture): MeshBasicMaterial;
  dispose(): void;
}

export function createMaterials(glowTexture: Texture): Materials {
  const wall = new MeshStandardMaterial({ color: 0xf3f2ef, roughness: 0.92, metalness: 0 });
  const floor = new MeshStandardMaterial({ color: 0xd4d1cb, roughness: 0.42, metalness: 0 });
  const ceiling = new MeshStandardMaterial({ color: 0xf7f7f5, roughness: 1 });
  const skylight = new MeshBasicMaterial({ color: 0xffffff });
  const frame = new MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.55 });
  const mat = new MeshStandardMaterial({ color: 0xfbfbfa, roughness: 1 });
  const visitor = new MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.85 });
  const thread = new LineBasicMaterial({ color: 0xb8b8bc });
  const edge = new LineBasicMaterial({ color: 0x8e8e93 });
  const glow = new MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false });
  const photos = new Map<Texture, MeshBasicMaterial>();
  const shared = [wall, floor, ceiling, skylight, frame, mat, visitor, thread, edge, glow];
  return {
    wall, floor, ceiling, skylight, frame, mat, visitor, thread, edge, glow,
    photo(texture) {
      let m = photos.get(texture);
      if (!m) {
        m = new MeshBasicMaterial({ map: texture });
        photos.set(texture, m);
      }
      return m;
    },
    dispose() {
      shared.forEach((m) => m.dispose());
      glowTexture.dispose();
      photos.forEach((m) => m.dispose());
      photos.clear();
    },
  };
}
