import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildGalleryPath } from '../../src/camera/gallery-path';
import { TRACK } from '../../src/camera/track';
import { buildSequence, findSegment, requireSegment } from '../../src/plan/sequence';
import { length, scale, sub, toLocal, toLocalDir } from '../../src/stage/frame';
import { computeGallery, type Gallery } from '../../src/stage/gallery';
import type { LengthMode, Vec3 } from '../../src/types';

const CUTS: { mode: LengthMode; music: number | null }[] = [
  { mode: 'auto', music: null }, { mode: 30, music: null }, { mode: 60, music: null }, { mode: 90, music: null }, { mode: 120, music: null },
  { mode: 'music', music: 46 }, { mode: 'music', music: 74 }, { mode: 'music', music: 104 }, { mode: 'music', music: 300 },
];

function make(mode: LengthMode = 'auto', music: number | null = null, n = 20) {
  const sequence = buildSequence({ photoCount: n, lengthMode: mode, musicDuration: music });
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const gallery = computeGallery({ sequence, aspects, portraitIndex: 0, seed: 9 });
  return { sequence, gallery, path: buildGalleryPath(sequence, gallery) };
}

const insideObstacle = (g: Gallery, p: Vec3, t: number) =>
  g.obstacles
    .filter((o) => (o.region === 'robots' || o.region === 'both') && (o.until === undefined || t < o.until))
    .find((o) => toLocal(o.frame, p).every((v, i) => v > o.min[i] && v < o.max[i]));

describe('buildGalleryPath', () => {
  it('follows the track until the dive', () => {
    const { sequence, gallery, path } = make();
    const dive = requireSegment(sequence, 'dive');
    for (let t = 0; t < dive.start; t += 1.7) {
      expect(path.poseAt(t).pos).toEqual(gallery.track.pos.at(t));
      expect(path.poseAt(t).target).toEqual(gallery.track.target.at(t));
    }
  });

  it('keeps a 38° lens and a continuous focus up to the ending card, in every cut (review I2)', () => {
    for (const c of CUTS) {
      const { sequence, path } = make(c.mode, c.music);
      const ending = requireSegment(sequence, 'ending');
      const dt = 1 / 30;
      for (let t = 0; t + dt < ending.start; t += dt) {
        const a = path.poseAt(t);
        const b = path.poseAt(t + dt);
        expect(a.fov).toBe(TRACK.fov);
        expect(Math.abs(b.focus - a.focus), `${c.mode}/${c.music} t=${t.toFixed(2)} focus`).toBeLessThan(0.6);
        expect(length(sub(b.pos, a.pos)), `${c.mode}/${c.music} t=${t.toFixed(2)} step`).toBeLessThan(0.6);
      }
    }
  });

  it('never moves backwards at the start of the dive, in every cut (review I4)', () => {
    for (const c of CUTS) {
      const { sequence, gallery, path } = make(c.mode, c.music);
      const dive = requireSegment(sequence, 'dive');
      const F = gallery.finale.frame;
      const d = dive.end - dive.start;
      for (let t = dive.start; t < dive.start + 0.35 * d; t += 0.1) {
        const v = toLocalDir(F, scale(sub(path.poseAt(t + 0.02).pos, path.poseAt(t).pos), 50));
        expect(v[2], `${c.mode}/${c.music} t=${t.toFixed(2)}`).toBeLessThan(0.05);
      }
    }
  });

  it('glides low over the carpet, then rises to look straight down on it (original 150–162 s)', () => {
    for (const c of CUTS) {
      const { sequence, gallery, path } = make(c.mode, c.music);
      const dive = requireSegment(sequence, 'dive');
      const F = gallery.finale.frame;
      const d = dive.end - dive.start;
      const low = toLocal(F, path.poseAt(dive.start + 0.6 * d).pos);
      expect(low[1], `${c.mode}/${c.music} glide height`).toBeLessThan(1.3);
      expect(Math.abs(low[2]), `${c.mode}/${c.music} over the carpet`).toBeLessThan(3);
      const end = path.poseAt(dive.end - 1e-6);
      const v = toLocalDir(F, sub(end.target, end.pos));
      expect(v[1] / length(v), `${c.mode}/${c.music} top-down`).toBeLessThan(-0.95);
      const above = toLocal(F, end.pos);
      expect(Math.hypot(above[0], above[2])).toBeLessThan(1);
      // Looking down along the platform's axis: the carpet sits square in the picture.
      const up = toLocalDir(F, end.up!);
      expect(Math.abs(up[0]), `${c.mode}/${c.music} up`).toBeLessThan(0.05);
      expect(up[2]).toBeLessThan(-0.9);
    }
  });

  it('never whips the picture around: it rolls at most 6°/s (at the original pace) from the dive to the card', () => {
    for (const c of [{ mode: 'auto' as const, music: null }, { mode: 60 as const, music: null }, { mode: 'music' as const, music: 300 }]) {
      const { sequence, path } = make(c.mode, c.music);
      const dive = requireSegment(sequence, 'dive');
      const ending = requireSegment(sequence, 'ending');
      const bound = 6 * (12 / (dive.end - dive.start));
      const cam = new PerspectiveCamera();
      const orient = (t: number) => {
        const p = path.poseAt(t);
        cam.up.set(...(p.up ?? [0, 1, 0]));
        cam.position.set(...p.pos);
        cam.lookAt(...p.target);
        return cam.quaternion.clone();
      };
      const dt = 1 / 30;
      for (let t = dive.start - 1; t + dt < ending.start; t += dt) {
        const a = orient(t);
        const b = orient(t + dt);
        const delta = b.clone().multiply(a.clone().invert());
        const w = Math.min(1, Math.abs(delta.w));
        const angle = 2 * Math.acos(w);
        const axis = new Vector3(delta.x, delta.y, delta.z).normalize().multiplyScalar(Math.sign(delta.w) || 1);
        const view = new Vector3(0, 0, -1).applyQuaternion(b);
        const roll = (angle * axis.dot(view) * 180) / Math.PI / dt;
        expect(Math.abs(roll), `${c.mode}/${c.music} t=${t.toFixed(2)}`).toBeLessThan(bound);
      }
      expect(new Quaternion()).toBeTruthy();
    }
  });

  it('never enters an obstacle in the robot room or during the dive, in every cut', () => {
    for (const c of CUTS) {
      const { sequence, gallery, path } = make(c.mode, c.music);
      const robots = requireSegment(sequence, 'robots');
      const dive = requireSegment(sequence, 'dive');
      for (let t = robots.start; t < dive.end; t += 0.1) {
        expect(insideObstacle(gallery, path.poseAt(t).pos, t)?.name, `${c.mode}/${c.music} t=${t.toFixed(2)}`).toBeUndefined();
      }
    }
  });

  it('stays 1.5 m from every star once the stars show (review M2)', () => {
    const { sequence, gallery, path } = make();
    const network = findSegment(sequence, 'network')!;
    const F = gallery.finale.frame;
    const C = gallery.finale.lifted;
    const stars = gallery.finale.network.stars;
    const n = network.end - network.start;
    for (let t = network.start + 0.4 * n; t < network.end; t += 0.25) {
      const rel = sub(toLocal(F, path.poseAt(t).pos), C);
      // Undo the network group's slow spin.
      const a = 0.03 * (t - network.start);
      const x = rel[0] * Math.cos(a) + rel[2] * Math.sin(a);
      const z = -rel[0] * Math.sin(a) + rel[2] * Math.cos(a);
      let nearest = Infinity;
      for (let i = 0; i < stars.length; i += 3) nearest = Math.min(nearest, Math.hypot(x - stars[i], rel[1] - stars[i + 1], z - stars[i + 2]));
      expect(nearest, `t=${t.toFixed(2)}`).toBeGreaterThan(1.5);
    }
  });

  it('ends high above the network and then frames the end card', () => {
    const { sequence, gallery, path } = make();
    const network = findSegment(sequence, 'network')!;
    const F = gallery.finale.frame;
    expect(length(sub(toLocal(F, path.poseAt(network.end - 1e-6).pos), gallery.finale.lifted))).toBeGreaterThan(25);
    const ending = requireSegment(sequence, 'ending');
    const pose = path.poseAt(ending.start + 1);
    const card = gallery.finale.card;
    expect(toLocal(F, pose.target)[1]).toBeCloseTo(card[1] - 0.2, 9);
    expect(length(sub(toLocal(F, pose.pos), card))).toBeCloseTo(6.2, 9);
  });
});
