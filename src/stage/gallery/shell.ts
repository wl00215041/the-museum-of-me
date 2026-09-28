import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Material, type Object3D } from 'three';
import { placeIn, type Frame } from '../frame';
import type { Region } from '../gallery';
import type { GalleryContext } from './context';

export interface Shell {
  walk: Group;
  robots: Group;
  both: Group;
  /** Objects removed from the scene after a time (the robot door, once it has crossed the lens). */
  timed: { object: Object3D; until: number }[];
}

/** Walls, floors and blocks of every region, each placed in its own frame. */
export function buildGalleryShell(ctx: GalleryContext): Shell {
  const { gallery, mats, tex } = ctx;
  const groups: Record<Region, Group> = { walk: new Group(), robots: new Group(), both: new Group() };
  for (const [region, g] of Object.entries(groups)) g.name = `shell:${region}`;
  const concrete = tex.concrete();
  const concreteFloor = (width: number, depth: number): Material => {
    const map = concrete.clone();
    map.repeat.set(width / 4, depth / 4);
    map.needsUpdate = true;
    const material = new MeshStandardMaterial({ map, roughness: 0.7 });
    material.userData.owned = true;
    material.userData.ownsMap = true;
    return material;
  };
  const put = (region: Region, frame: Frame, mesh: Mesh, name: string): Group => {
    mesh.name = name;
    const holder = placeIn(frame, new Group());
    holder.add(mesh);
    groups[region].add(holder);
    return holder;
  };

  for (const w of gallery.walls) {
    const mesh = new Mesh(new PlaneGeometry(w.width, w.height), w.dark ? mats.darkWall : mats.wall);
    mesh.position.set(w.center[0], w.center[1], 0);
    put(w.region, w.frame, mesh, w.name);
  }
  for (const f of gallery.floors) {
    const mesh = new Mesh(new PlaneGeometry(f.width, f.depth), f.dark ? mats.darkFloor : concreteFloor(f.width, f.depth));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(f.center[0], 0, f.center[1]);
    put(f.region, f.frame, mesh, f.name);
  }
  const timed: Shell['timed'] = [];
  for (const b of gallery.blocks) {
    const mesh = new Mesh(new BoxGeometry(b.size[0], b.size[1], b.size[2]), b.dark ? mats.pillarDark : mats.wall);
    mesh.position.set(b.center[0], b.center[1], b.center[2]);
    const holder = put(b.region, b.frame, mesh, b.name);
    if (b.until !== undefined) timed.push({ object: holder, until: b.until });
  }
  return { ...groups, timed };
}
