import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { UvRect } from '../../../assets/atlas';
import { localU, requireSegment } from '../../../plan/sequence';
import { clamp, lerp } from '../../../util/math';
import { cellTextureCropped } from '../../parts/atlas-mesh';
import { addVisitors, createLabel } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

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

export function buildVideosRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats, sequence } = ctx;
  const v = strip.videos;
  if (!v) return null;
  const segment = requireSegment(sequence, 'videos');
  const group = new Group();
  group.name = 'room:videos';
  group.add(createLabel(tex, v.label, mats));

  const xs = v.panels.map((p) => p.center[0]);
  const ys = v.panels.map((p) => p.center[1]);
  const pw = v.panels[0].width;
  const ph = v.panels[0].height;
  const wallW = Math.max(...xs) - Math.min(...xs) + pw;
  const wallH = Math.max(...ys) - Math.min(...ys) + ph;
  const backing = new Mesh(new BoxGeometry(wallW + 0.3, wallH + 0.3, 0.12), mats.darkWall);
  backing.position.set((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, -0.05);
  group.add(backing);

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
    mesh.position.set(...p.center);
    group.add(mesh);
    return { panel: p, material };
  });

  for (const monitor of v.monitors) {
    const material = new MeshBasicMaterial({ map: cellTextureCropped(content.library, monitor.photoIndex, monitor.width / monitor.height) });
    material.color.setScalar(1.3);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const screen = new Mesh(new PlaneGeometry(monitor.width, monitor.height), material);
    screen.name = 'screen';
    screen.rotation.y = Math.atan2(monitor.normal[0], monitor.normal[2]);
    screen.position.set(...monitor.center);
    group.add(screen);
  }

  const update = (t: number) => {
    const u = localU(segment, t);
    const zoom = lerp(1, 1.12, u);
    const pan = lerp(-0.04, 0.04, u);
    for (const { panel, material } of panels) {
      const [ru, rv, rw, rh] = videoPanelRect(panel.col, panel.row, 4, 3, cover, zoom, pan);
      material.map!.offset.set(ru, rv);
      material.map!.repeat.set(rw, rh);
    }
  };
  update(segment.start);
  addVisitors(group, v.visitors, mats);
  return { group, update };
}
