import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight } from 'three';
import type { UvRect } from '../../../assets/atlas';
import { findSegment, localU, requireSegment } from '../../../plan/sequence';
import { clamp, lerp } from '../../../util/math';
import { placeIn } from '../../frame';
import { HALL } from '../../gallery';
import { cellTextureCropped } from '../../parts/atlas-mesh';
import { createCrt } from '../../parts/crt';
import { createThumbSculpture } from '../../parts/thumb';
import { addVisitors } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

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

/** The dark hall around the thumb: Likes 5.1 (old TVs), Photos 5.2 (grid wall), Videos 5.3 (original 92–122 s). */
export function buildHallRoom(ctx: GalleryContext): RoomObject | null {
  const { gallery, content, tex, mats, sequence } = ctx;
  const h = gallery.hall;
  if (!h) return null;
  const lib = content.library;
  const likes = requireSegment(sequence, 'likes');
  const group = new Group();
  group.name = 'room:hall';

  const thumbHolder = placeIn(h.thumb, new Group());
  const P = HALL.pedestal;
  const pedestal = new Mesh(new CylinderGeometry(P.radius, P.radius + 0.08, P.height, 64), mats.pedestal);
  pedestal.position.y = P.height / 2;
  const thumb = createThumbSculpture(mats.sculpture, 7);
  thumb.position.y = P.height;
  // Lit from the upper left, as in the original.
  const spot = new SpotLight(0xffffff, 100, 24, 0.5, 0.6, 1.5);
  spot.position.set(-2.5, 9, 3);
  spot.target.position.set(0, 1.5, 0);
  thumbHolder.add(pedestal, thumb, spot, spot.target);
  group.add(thumbHolder);

  const bars = new MeshBasicMaterial({ map: tex.colorBars() });
  bars.color.setScalar(0.55);
  bars.userData.owned = true;
  bars.userData.ownsMap = true;
  const crtHolder = placeIn(h.crts.frame, new Group());
  for (const s of h.crts.screens) {
    let screen = bars;
    if (!s.bars) {
      screen = new MeshBasicMaterial({ map: cellTextureCropped(lib, s.photoIndex, s.width / s.height) });
      screen.color.setScalar(0.55);
      screen.userData.owned = true;
      screen.userData.ownsMap = true;
    }
    const crt = createCrt({ body: mats.crtBody, stand: mats.crtStand, screen, width: s.width, height: s.height, standHeight: s.center[1] });
    crt.position.set(s.center[0], s.center[1], s.center[2]);
    crtHolder.add(crt);
  }
  group.add(crtHolder);

  // Grid wall: every photo it will ever show gets its material up front, so updates never allocate.
  const G = HALL.grid;
  const cache = new Map<number, MeshBasicMaterial>();
  const photoMaterial = (i: number): MeshBasicMaterial => {
    let m = cache.get(i);
    if (!m) {
      m = new MeshBasicMaterial({ map: cellTextureCropped(lib, i, G.width / G.height) });
      m.color.setScalar(0.9);
      m.userData.photoIndex = i;
      cache.set(i, m);
    }
    return m;
  };
  for (const cell of h.grid.cells) for (const p of cell.photos) photoMaterial(p);
  const gridHolder = placeIn(h.grid.frame, new Group());
  const cells = h.grid.cells.map((cell) => {
    const mesh = new Mesh(new PlaneGeometry(cell.width, cell.height), photoMaterial(cell.photos[0]));
    mesh.name = 'grid-cell';
    mesh.position.set(cell.center[0], cell.center[1], cell.center[2]);
    gridHolder.add(mesh);
    return { mesh, cell };
  });
  group.add(gridHolder);

  // Videos wall: one photo across all panels, slowly zooming and panning.
  const span = findSegment(sequence, 'videos') ?? likes;
  const vHolder = placeIn(h.videos.frame, new Group());
  const xs = h.videos.panels.map((p) => p.center[0]);
  const ys = h.videos.panels.map((p) => p.center[1]);
  const pw = h.videos.panels[0].width;
  const ph = h.videos.panels[0].height;
  const wallW = Math.max(...xs) - Math.min(...xs) + pw;
  const wallH = Math.max(...ys) - Math.min(...ys) + ph;
  const backing = new Mesh(new BoxGeometry(wallW + 0.3, wallH + 0.3, 0.12), mats.darkWall);
  backing.position.set((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, -0.05);
  vHolder.add(backing);
  const photo = hiresOf(content, h.videos.photoIndex);
  const cover = coverRect(lib.aspects[h.videos.photoIndex], wallW / wallH);
  const panels = h.videos.panels.map((p) => {
    const material = new MeshBasicMaterial({ map: photo.clone() });
    material.map!.needsUpdate = true;
    material.color.setScalar(1.35);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const mesh = new Mesh(new PlaneGeometry(p.width, p.height), material);
    mesh.name = 'video-panel';
    mesh.position.set(p.center[0], p.center[1], p.center[2]);
    vHolder.add(mesh);
    return { panel: p, material };
  });
  addVisitors(vHolder, h.videos.visitors, mats);
  group.add(vHolder);
  addVisitors(group, h.visitors, mats);

  const last = h.grid.cells[0].photos.length - 1;
  const update = (t: number) => {
    const k = clamp(Math.floor((t - h.grid.start) / h.grid.step), 0, last);
    for (const { mesh, cell } of cells) mesh.material = photoMaterial(cell.photos[k]);
    const u = localU(span, t);
    const zoom = lerp(1, 1.12, u);
    const pan = lerp(-0.04, 0.04, u);
    for (const { panel, material } of panels) {
      const [ru, rv, rw, rh] = videoPanelRect(panel.col, panel.row, HALL.videos.cols, HALL.videos.rows, cover, zoom, pan);
      material.map!.offset.set(ru, rv);
      material.map!.repeat.set(rw, rh);
    }
  };
  update(likes.start);
  return {
    group,
    update,
    dispose() {
      for (const m of cache.values()) {
        m.map?.dispose();
        m.dispose();
      }
      cache.clear();
    },
  };
}
