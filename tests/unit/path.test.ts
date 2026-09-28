import { describe, expect, it } from 'vitest';
import { buildCameraPath, lineZ } from '../../src/camera/path';
import { createSpline } from '../../src/camera/spline';
import { buildSequence, findSegment, requireSegment } from '../../src/plan/sequence';
import { LINE, PUSH, computeStrip, yawAt } from '../../src/stage/strip';
import type { LengthMode, Vec3 } from '../../src/types';

function make(n: number, lengthMode: LengthMode = 'auto') {
  const sequence = buildSequence({ photoCount: n, lengthMode, musicDuration: null });
  const strip = computeStrip({ sequence, aspects: Array.from({ length: n }, () => 1.5), portraitIndex: 0, seed: 9 });
  return { sequence, strip, path: buildCameraPath(sequence, strip) };
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('createSpline', () => {
  it('passes through keys and honours an explicit start velocity', () => {
    const s = createSpline([
      { t: 0, value: [0, 0, 0], velocity: [2, 0, 0] },
      { t: 1, value: [3, 1, 0] },
      { t: 2, value: [4, 1, 1] },
    ]);
    expect(s.at(1)).toEqual([3, 1, 0]);
    const h = 1e-5;
    expect((s.at(h)[0] - s.at(0)[0]) / h).toBeCloseTo(2, 3);
    expect(s.at(-1)).toEqual([0, 0, 0]);
    expect(s.at(9)).toEqual([4, 1, 1]);
    expect(() => createSpline([{ t: 0, value: [0, 0, 0] }])).toThrow();
  });
});

describe('buildCameraPath', () => {
  it('walks at exactly the same x step every frame', () => {
    for (const mode of ['auto', 30, 60] as const) {
      const { strip, path } = make(20, mode);
      const dt = 1 / 30;
      for (let t = 0; t + dt < strip.walkEnd; t += dt) {
        const a = path.poseAt(t).pos;
        const b = path.poseAt(t + dt).pos;
        expect(a[0]).toBeCloseTo(strip.speed * t, 9);
        expect(b[0] - a[0]).toBeCloseTo(strip.speed * dt, 9);
        expect(a[1]).toBe(LINE.eye);
      }
    }
  });

  it('starts turned 18° to the right and is parallel from t_par on', () => {
    const { strip, path } = make(20);
    const view = (t: number) => {
      const p = path.poseAt(t);
      return Math.atan2(p.target[0] - p.pos[0], p.pos[2] - p.target[2]);
    };
    expect(view(0)).toBeCloseTo(LINE.yaw0, 9);
    expect(view(strip.tPar)).toBeCloseTo(0, 12);
    expect(yawAt(strip, strip.tPar + 5)).toBe(0);
    const ex = path.poseAt(strip.tEx);
    expect(ex.pos[0]).toBeCloseTo(strip.wall.exhibition.center[0], 9);
    expect(ex.target[0]).toBeCloseTo(ex.pos[0], 9);
  });

  it('pushes in during Words without breaking the constant x speed, and pulls back in the next room', () => {
    const { sequence, strip, path } = make(20);
    const words = requireSegment(sequence, 'words');
    const next = sequence.segments[sequence.segments.indexOf(words) + 1];
    const tEnd = words.start + PUSH.end * (words.end - words.start);
    expect(lineZ(sequence, words.start)).toBe(LINE.z);
    expect(path.poseAt(tEnd).pos[2]).toBeCloseTo(PUSH.z, 9);
    expect(path.poseAt(tEnd).pos[0]).toBeCloseTo(strip.speed * tEnd, 9);
    expect(path.poseAt(next.start + PUSH.pullBack * (next.end - next.start)).pos[2]).toBeCloseTo(LINE.z, 9);
  });

  it('every preset is continuous in position and has no jumps up to the ending', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      const { sequence, path } = make(12, mode);
      const ending = requireSegment(sequence, 'ending');
      const dt = 1 / 30;
      for (let t = 0; t + dt < ending.start; t += dt) {
        expect(dist(path.poseAt(t).pos, path.poseAt(t + dt).pos), `${mode} at ${t.toFixed(2)}`).toBeLessThan(0.5);
      }
    }
  });

  it('keeps the velocity continuous where the walk hands over to the dive', () => {
    const { sequence, path, strip } = make(20);
    const t0 = requireSegment(sequence, 'dive').start;
    const h = 1e-3;
    const left = (path.poseAt(t0).pos[0] - path.poseAt(t0 - h).pos[0]) / h;
    const right = (path.poseAt(t0 + h).pos[0] - path.poseAt(t0).pos[0]) / h;
    expect(left).toBeCloseTo(strip.speed, 2);
    expect(right).toBeCloseTo(strip.speed, 1);
  });

  it('never enters an obstacle during the walk and the dive', () => {
    const problems: string[] = [];
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      for (const n of [3, 20]) {
        const { sequence, strip, path } = make(n, mode);
        const end = requireSegment(sequence, 'dive').end;
        for (let t = 0; t <= end; t += 0.05) {
          const [x, y, z] = path.poseAt(t).pos;
          for (const o of strip.obstacles) {
            const pad = 0.15;
            if (x > o.min[0] - pad && x < o.max[0] + pad && y > o.min[1] - pad && y < o.max[1] + pad && z > o.min[2] - pad && z < o.max[2] + pad) {
              problems.push(`${mode}/${n} t=${t.toFixed(2)} inside ${o.name}`);
            }
          }
        }
      }
    }
    expect(problems.slice(0, 8)).toEqual([]);
  });

  it('ends high above the network and then frames the end card', () => {
    const { sequence, strip, path } = make(20);
    const network = findSegment(sequence, 'network')!;
    expect(dist(path.poseAt(network.end - 1e-6).pos, strip.finale.lifted)).toBeGreaterThan(25);
    const ending = requireSegment(sequence, 'ending');
    const pose = path.poseAt(ending.start + 1);
    expect(pose.target[1]).toBeCloseTo(strip.finale.card[1] - 0.2, 9);
    expect(dist(pose.pos, strip.finale.card)).toBeCloseTo(6.2, 9);
  });

  it('focus distance is positive everywhere', () => {
    const { sequence, path } = make(20);
    for (let t = 0; t <= sequence.total; t += 0.5) expect(path.poseAt(t).focus).toBeGreaterThan(0.5);
  });
});
