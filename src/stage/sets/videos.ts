import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { UvRect } from '../../assets/atlas';
import type { ShotId } from '../../types';
import { clamp, lerp } from '../../util/math';
import { hiresOf, localU, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { VIDEO_WALL } from '../layout';
import { addDarkRoom, addVisitors, darkScene } from './common';

/** The part of a photo (aspect) that covers a target aspect, in UV space. */
export function coverRect(aspect: number, target: number): UvRect {
  return aspect > target ? [(1 - target / aspect) / 2, 0, target / aspect, 1] : [0, (1 - aspect / target) / 2, 1, aspect / target];
}

/** Sub-rect for panel (col, row) of the cover rect zoomed about its centre and panned sideways; row 0 is the top. */
export function videoPanelRect(col: number, row: number, cols: number, rows: number, cover: UvRect, zoom: number, pan: number): UvRect {
  const [cu, cv, cw, ch] = cover;
  const w = cw / zoom;
  const h = ch / zoom;
  const u0 = cu + clamp((cw - w) / 2 + pan * cw, 0, cw - w);
  const v0 = cv + (ch - h) / 2;
  const pw = w / cols;
  const ph = h / rows;
  return [u0 + col * pw, v0 + (rows - 1 - row) * ph, pw, ph];
}

export function buildVideosSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, mats, storyboard } = ctx;
  const span = spanOf(storyboard, 'videos');
  const v = layout.videos;
  const { cols, rows, panelWidth, panelHeight, gap, centerY } = VIDEO_WALL;
  const scene = darkScene();
  addDarkRoom(scene, mats, 30, 16);
  const wallW = cols * panelWidth + (cols - 1) * gap;
  const wallH = rows * panelHeight + (rows - 1) * gap;
  const backing = new Mesh(new BoxGeometry(wallW + 0.3, wallH + 0.3, 0.12), mats.darkWall);
  backing.position.set(0, centerY, -0.06);
  scene.add(backing);

  const photo = hiresOf(content, v.photoIndex);
  const cover = coverRect(content.library.aspects[v.photoIndex], wallW / wallH);
  const panels = v.panels.map((p) => {
    const material = new MeshBasicMaterial({ map: photo.clone() });
    material.map!.needsUpdate = true;
    material.color.setScalar(1.35);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const mesh = new Mesh(new PlaneGeometry(p.width, p.height), material);
    mesh.name = 'video-panel';
    mesh.position.set(p.center[0], p.center[1], 0.01);
    scene.add(mesh);
    return { panel: p, material };
  });
  const update = (t: number) => {
    const u = localU(span, t);
    const zoom = lerp(1, 1.12, u);
    const pan = lerp(-0.04, 0.04, u);
    for (const { panel, material } of panels) {
      const [ru, rv, rw, rh] = videoPanelRect(panel.col, panel.row, cols, rows, cover, zoom, pan);
      material.map!.offset.set(ru, rv);
      material.map!.repeat.set(rw, rh);
    }
  };
  update(span.start);
  addVisitors(scene, v.visitors, mats);
  return { ids, scene, dark: true, update, dispose: () => disposeScene(scene) };
}
