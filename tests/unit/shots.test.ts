import { describe, expect, it } from 'vitest';
import { buildShots } from '../../src/camera/shots';
import { buildStoryboard } from '../../src/plan/storyboard';
import { computeStageLayout } from '../../src/stage/layout';
import { WALL, wallRunOf } from '../../src/stage/wall-run';
import type { LengthMode } from '../../src/types';

function make(n: number, lengthMode: LengthMode = 'auto') {
  const storyboard = buildStoryboard({ photoCount: n, lengthMode, musicDuration: null });
  const layout = computeStageLayout({ storyboard, aspects: Array.from({ length: n }, () => 1.5), portraitIndex: 0, seed: 5 });
  return { storyboard, layout, shots: buildShots(storyboard, layout) };
}

describe('buildShots', () => {
  it('trucks along the wall at a constant speed with a level camera', () => {
    for (const mode of ['auto', 30, 60] as const) {
      const { storyboard, shots } = make(20, mode);
      const run = wallRunOf(storyboard);
      const dt = 0.05;
      for (let t = 0; t + dt <= run.end; t += dt) {
        const a = shots.poseAt(t).pos;
        const b = shots.poseAt(t + dt).pos;
        expect((b[0] - a[0]) / dt).toBeCloseTo(run.speed, 6);
        expect(b[1]).toBe(WALL.eye);
        expect(b[2]).toBe(WALL.distance);
      }
    }
  });

  it('looks straight at the exhibition text at its midpoint', () => {
    const { storyboard, layout, shots } = make(20);
    const run = wallRunOf(storyboard);
    const pose = shots.poseAt(run.exhibitionTime);
    expect(pose.pos[0]).toBeCloseTo(layout.wall.exhibition.center[0], 9);
    expect(pose.target[0]).toBeCloseTo(pose.pos[0], 9);
  });

  it('shows the title in frame at the start, turned to the right', () => {
    const { layout, shots } = make(20);
    const pose = shots.poseAt(0);
    const view = Math.atan2(pose.target[0] - pose.pos[0], pose.pos[2] - pose.target[2]);
    const toTitle = Math.atan2(layout.wall.title.center[0] - pose.pos[0], pose.pos[2] - layout.wall.title.center[2]);
    expect(view).toBeGreaterThan(0);
    expect(Math.abs(toTitle - view)).toBeLessThan((WALL.fov / 2) * (Math.PI / 180));
  });

  it('produces finite poses for every shot in every preset', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      const { storyboard, shots } = make(12, mode);
      for (let t = 0; t <= storyboard.total; t += 0.1) {
        const p = shots.poseAt(t);
        for (const v of [...p.pos, ...p.target, p.fov]) expect(Number.isFinite(v)).toBe(true);
        expect(p.fov).toBeGreaterThan(20);
      }
    }
  });

  it('keeps the robots camera above the photo platform', () => {
    const { storyboard, layout, shots } = make(12);
    const span = storyboard.shots.find((s) => s.id === 'robots')!;
    const { width, depth, height } = layout.robots.platform;
    for (let t = span.start; t <= span.end; t += 0.05) {
      const [x, y, z] = shots.poseAt(t).pos;
      if (Math.abs(x) < width / 2 && Math.abs(z) < depth / 2) expect(y).toBeGreaterThan(height + 0.3);
    }
  });

  it('pulls back from the network centre', () => {
    const { storyboard, shots } = make(12);
    const span = storyboard.shots.find((s) => s.id === 'network')!;
    const d = (t: number) => Math.hypot(...shots.poseAt(t).pos);
    expect(d(span.start)).toBeGreaterThan(1.2);
    expect(d(span.end - 1e-6)).toBeGreaterThan(d(span.start) * 10);
  });
});
