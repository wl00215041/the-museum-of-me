import { Color, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { ShotId } from '../../types';
import { clamp, lerp, smoothstep } from '../../util/math';
import { hiresOf, localU, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { buildAtlasInstances, type AtlasInstance } from '../parts/atlas-mesh';
import { cropTexture } from '../parts/canvas-block';
import { darkScene } from './common';

/** Multiplier that brings a photo's average colour to the cell colour (softened, clamped). */
function tint(cell: number, photo: number): number {
  return 1 + (clamp(cell / Math.max(photo, 0.04), 0, 3) - 1) * 0.9;
}

export function buildMosaicSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, storyboard } = ctx;
  const span = spanOf(storyboard, 'mosaic');
  const { cols, rows, tile } = layout.mosaic;
  const lib = content.library;
  const { colors, assignment } = content.mosaic;
  const scene = darkScene();
  scene.background = new Color(0x000000);
  const group = new Group();
  group.name = 'mosaic';
  scene.add(group);

  const items: AtlasInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const p = assignment[i];
      const pc = lib.colors[p];
      items.push({
        photoIndex: p,
        matrix: new Matrix4().compose(
          new Vector3((c - (cols - 1) / 2) * tile, ((rows - 1) / 2 - r) * tile, 0),
          new Quaternion(),
          new Vector3(tile * 0.94, tile * 0.94, 1),
        ),
        color: new Color(tint(colors[i * 3], pc[0]), tint(colors[i * 3 + 1], pc[1]), tint(colors[i * 3 + 2], pc[2])),
      });
    }
  }
  for (const mesh of buildAtlasInstances({
    geometry: new PlaneGeometry(1, 1),
    library: lib,
    items,
    material: (atlas) => ctx.mats.atlas(lib.atlases[atlas], false),
    rect: 'square',
  })) {
    mesh.name = 'mosaic-tiles';
    group.add(mesh);
  }

  const portrait = hiresOf(content, layout.portraitIndex);
  const overlayMaterial = new MeshBasicMaterial({
    map: cropTexture(portrait, lib.aspects[layout.portraitIndex], cols / rows),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  overlayMaterial.userData.owned = true;
  overlayMaterial.userData.ownsMap = true;
  const overlay = new Mesh(new PlaneGeometry(cols * tile, rows * tile), overlayMaterial);
  overlay.name = 'mosaic-overlay';
  overlay.position.z = 0.01;
  group.add(overlay);

  return {
    ids,
    scene,
    dark: true,
    update(t) {
      const u = localU(span, t);
      overlayMaterial.opacity = smoothstep(0.55, 0.85, u);
      group.scale.setScalar(lerp(1, 0.35, smoothstep(0.6, 1, u)));
    },
    dispose: () => disposeScene(scene),
  };
}
