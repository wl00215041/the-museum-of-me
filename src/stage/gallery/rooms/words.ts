import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';
import { localU, requireSegment } from '../../../plan/sequence';
import { LED_V4, ledPhaseAt, ledRowOffset } from '../../parts/led';
import { addVisitors } from '../common';
import type { GalleryContext, RoomObject } from '../context';

type PhaseName = keyof typeof LED_V4.phases;

/** Words: the LED wall at the back of its recess. Rows scroll in alternating directions; the screen switches its own content. */
export function buildWordsRoom(ctx: GalleryContext): RoomObject | null {
  const { gallery, content, mats, sequence } = ctx;
  const w = gallery.words;
  if (!w) return null;
  const segment = requireSegment(sequence, 'words');
  const W = w.wall;
  const group = new Group();
  group.name = 'room:words';
  const backing = new Mesh(new BoxGeometry(W.width + 0.4, W.height + 0.4, 0.2), mats.darkWall);
  backing.position.set(W.center[0], W.center[1], W.center[2] - 0.11);
  group.add(backing);

  const glowing = (map: Texture): MeshBasicMaterial => {
    const m = new MeshBasicMaterial({ map });
    m.color.setScalar(1.6);
    m.userData.owned = true;
    m.userData.ownsMap = true;
    return m;
  };
  const rowsOf = (source: Texture, phase: PhaseName) => {
    const count = LED_V4.phases[phase].rows;
    return Array.from({ length: count }, (_, row) => {
      const map = source.clone();
      map.needsUpdate = true;
      map.repeat.set(LED_V4.window, 1 / count);
      map.offset.set(ledRowOffset(row, 0, LED_V4.phases[phase].units), 1 - (row + 1) / count);
      const mesh = new Mesh(new PlaneGeometry(W.width, W.height / count), glowing(map));
      mesh.name = `led-${phase}`;
      mesh.position.set(W.center[0], W.center[1] + W.height / 2 - (row + 0.5) * (W.height / count), W.center[2]);
      group.add(mesh);
      return { mesh, map, row };
    });
  };
  const phases: Record<PhaseName, ReturnType<typeof rowsOf>> = {
    small: rowsOf(content.led.small, 'small'),
    large: rowsOf(content.led.large, 'large'),
    full: rowsOf(content.led.full, 'full'),
  };
  const highlight = new Mesh(new PlaneGeometry(W.width * 0.28, W.height * 0.36), glowing(content.led.highlight.clone()));
  highlight.name = 'led-highlight';
  highlight.position.set(W.center[0], W.center[1], W.center[2] + 0.005);
  group.add(highlight);
  addVisitors(group, w.visitors, mats);

  const [a, , c, d] = gallery.track.ledSwitches;
  const update = (t: number) => {
    const phase = ledPhaseAt(localU(segment, t));
    const shown: PhaseName = phase === 'highlight' ? 'large' : phase;
    const start = shown === 'small' ? (t < a ? segment.start : d) : shown === 'large' ? a : c;
    for (const name of Object.keys(phases) as PhaseName[]) {
      for (const r of phases[name]) {
        r.mesh.visible = name === shown;
        if (name === shown) r.map.offset.x = ledRowOffset(r.row, t - start, LED_V4.phases[name].units);
      }
    }
    highlight.visible = phase === 'highlight';
  };
  update(segment.start);
  return { group, update };
}
