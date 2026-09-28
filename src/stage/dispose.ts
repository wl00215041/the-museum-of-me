import type { Material, MeshBasicMaterial, Object3D } from 'three';

/** Disposes every geometry under `root` and the materials (and maps) marked as owned. */
export function disposeScene(root: Object3D): void {
  root.traverse((obj) => {
    const node = obj as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    node.geometry?.dispose();
    if (!node.material) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!m.userData.owned) continue;
      if (m.userData.ownsMap) (m as MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}
