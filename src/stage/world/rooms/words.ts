import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';
import { localU, requireSegment } from '../../../plan/sequence';
import { smoothstep } from '../../../util/math';
import { addVisitors, createLabel } from '../common';
import type { RoomObject, WorldContext } from '../context';

export function buildWordsRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats, sequence } = ctx;
  const w = strip.words;
  if (!w) return null;
  const segment = requireSegment(sequence, 'words');
  const group = new Group();
  group.name = 'room:words';
  group.add(createLabel(tex, w.label, mats));
  const backing = new Mesh(new BoxGeometry(w.wall.width + 0.4, w.wall.height + 0.4, 0.2), mats.darkWall);
  backing.position.set(w.wall.center[0], w.wall.center[1], w.wall.center[2] - 0.1);
  const panel = (map: Texture, name: string, dz: number, opacity: number) => {
    const material = new MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false });
    material.color.setScalar(1.6);
    material.userData.owned = true;
    const mesh = new Mesh(new PlaneGeometry(w.wall.width, w.wall.height), material);
    mesh.name = name;
    mesh.position.set(w.wall.center[0], w.wall.center[1], w.wall.center[2] + dz);
    return mesh;
  };
  const main = panel(content.led.main, 'led-main', 0.01, 1);
  const highlight = panel(content.led.highlight, 'led-highlight', 0.012, 0);
  group.add(backing, main, highlight);
  addVisitors(group, w.visitors, mats);
  return {
    group,
    update(t) {
      const u = localU(segment, t);
      const h = smoothstep(0.5, 0.55, u) * (1 - smoothstep(0.7, 0.75, u));
      (highlight.material as MeshBasicMaterial).opacity = h;
      (main.material as MeshBasicMaterial).opacity = 1 - 0.85 * h;
    },
  };
}
