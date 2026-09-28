import { Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { TRACK } from '../../src/camera/track';
import { requireSegment } from '../../src/plan/sequence';
import { buildLocationRoom } from '../../src/stage/gallery/rooms/location';
import { buildWordsRoom } from '../../src/stage/gallery/rooms/words';
import { LED_V4, ledPhaseAt, ledRowOffset } from '../../src/stage/parts/led';
import type { Segment } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const at = (s: Segment, u: number) => s.start + u * (s.end - s.start);
const offsets = (root: Object3D, name: string) => (named(root, name) as Mesh<PlaneGeometry, MeshBasicMaterial>[]).map((m) => m.material.map!.offset.x);

describe('LED phases', () => {
  it('follows the switches measured on the original', () => {
    const [a, b, c, d] = TRACK.words.switches;
    expect(ledPhaseAt(0)).toBe('small');
    expect(ledPhaseAt((a + b) / 2)).toBe('large');
    expect(ledPhaseAt((b + c) / 2)).toBe('highlight');
    expect(ledPhaseAt((c + d) / 2)).toBe('full');
    expect(ledPhaseAt(0.95)).toBe('small');
  });

  it('neighbouring rows scroll in opposite directions and stay inside the texture', () => {
    expect(ledRowOffset(0, 4, 200)).toBeGreaterThan(ledRowOffset(0, 0, 200));
    expect(ledRowOffset(1, 4, 200)).toBeLessThan(ledRowOffset(1, 0, 200));
    for (const s of [0, 10, 1000]) {
      for (const r of [0, 1]) {
        const o = ledRowOffset(r, s, 58);
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1 - LED_V4.window);
      }
    }
  });
});

describe('Location', () => {
  it('three glowing light boxes on the shallow wall, in the Location frame', () => {
    const ctx = fakeGalleryContext(3);
    const room = buildLocationRoom(ctx)!;
    expect(named(room.group, 'lightbox')).toHaveLength(3);
    expect(room.group.position.z).toBeCloseTo(TRACK.dark.wallZ, 12);
    expect(buildLocationRoom(fakeGalleryContext(12, 30))).toBeNull();
  });
});

describe('Words', () => {
  const ctx = fakeGalleryContext(20);
  const room = buildWordsRoom(ctx)!;
  const words = requireSegment(ctx.sequence, 'words');
  const visible = (name: string) => named(room.group, name).filter((o) => o.visible).length;
  const [a, b, c, d] = TRACK.words.switches;

  it('shows 14 small rows, then 8 large rows, the highlight box, 4 full rows and small rows again', () => {
    const P = LED_V4.phases;
    room.update!(at(words, a / 2));
    expect([visible('led-small'), visible('led-large'), visible('led-full'), visible('led-highlight')]).toEqual([P.small.rows, 0, 0, 0]);
    room.update!(at(words, (a + b) / 2));
    expect([visible('led-small'), visible('led-large'), visible('led-full'), visible('led-highlight')]).toEqual([0, P.large.rows, 0, 0]);
    room.update!(at(words, (b + c) / 2));
    expect([visible('led-large'), visible('led-highlight')]).toEqual([P.large.rows, 1]);
    room.update!(at(words, (c + d) / 2));
    expect([visible('led-small'), visible('led-large'), visible('led-full'), visible('led-highlight')]).toEqual([0, 0, P.full.rows, 0]);
    room.update!(at(words, 0.95));
    expect(visible('led-small')).toBe(P.small.rows);
  });

  it('rows fill the LED wall from top to bottom', () => {
    const rows = named(room.group, 'led-small') as Mesh<PlaneGeometry>[];
    const total = rows.reduce((s, m) => s + m.geometry.parameters.height, 0);
    expect(total).toBeCloseTo(ctx.gallery.words!.wall.height, 9);
    expect(rows[0].position.y).toBeGreaterThan(rows[rows.length - 1].position.y);
  });

  it('neighbouring rows move in opposite directions as time passes', () => {
    room.update!(at(words, 0.05));
    const before = offsets(room.group, 'led-small');
    room.update!(at(words, 0.3));
    const after = offsets(room.group, 'led-small');
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeLessThan(before[1]);
  });

  it('is pure in time: scrubbing back gives the same offsets', () => {
    room.update!(at(words, 0.2));
    const first = offsets(room.group, 'led-small');
    room.update!(at(words, 0.9));
    room.update!(at(words, 0.2));
    expect(offsets(room.group, 'led-small')).toEqual(first);
  });

  it('stays inside its textures in a 300 s cut', () => {
    const long = fakeGalleryContext(20, 'music', { music: 300 });
    const r = buildWordsRoom(long)!;
    const w = requireSegment(long.sequence, 'words');
    for (let t = w.start; t <= w.end; t += 0.5) {
      r.update!(t);
      for (const name of ['led-small', 'led-large', 'led-full']) {
        for (const o of offsets(r.group, name)) expect(o >= 0 && o <= 1 - LED_V4.window).toBe(true);
      }
    }
  });
});
