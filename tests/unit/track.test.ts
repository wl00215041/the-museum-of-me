import { describe, expect, it } from 'vitest';
import { HALF_HFOV_TAN, TRACK, computeTrack, whiteWalk } from '../../src/camera/track';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import { dirOf, dot, length, rightOf, scale, sub, toLocal, toLocalDir } from '../../src/stage/frame';
import type { LengthMode, Segment, Sequence, Vec3 } from '../../src/types';

const CUTS: { mode: LengthMode; music: number | null }[] = [
  { mode: 'auto', music: null }, { mode: 30, music: null }, { mode: 60, music: null }, { mode: 90, music: null }, { mode: 120, music: null },
  { mode: 'music', music: 46 }, { mode: 'music', music: 74 }, { mode: 'music', music: 104 }, { mode: 'music', music: 300 },
];
const seq = (mode: LengthMode = 'auto', music: number | null = null): Sequence => buildSequence({ photoCount: 20, lengthMode: mode, musicDuration: music });
const at = (s: Segment, u: number) => s.start + u * (s.end - s.start);
/** Speed the fixed cuts need: the white wall passes in proportionally less time. */
const speedFor = (s: Sequence) => { const e = requireSegment(s, 'exhibition'); return (TRACK.speed * 10) / (e.end - e.start); };
const viewYaw = (tr: ReturnType<typeof computeTrack>, t: number) => { const d = sub(tr.target.at(t), tr.pos.at(t)); return Math.atan2(d[0], -d[2]); };

describe('computeTrack — auto cut, measured on the original', () => {
  const s = seq();
  const tr = computeTrack(s, TRACK.speed);
  const ex = requireSegment(s, 'exhibition');
  const photos = requireSegment(s, 'photos');

  it('walks at exactly the same x step every frame on the white wall', () => {
    const dt = 1 / 30;
    for (let t = at(ex, 0.5); t + dt < tr.anchors.tPullBack; t += dt) expect(tr.pos.at(t + dt)[0] - tr.pos.at(t)[0]).toBeCloseTo(TRACK.speed * dt, 9);
  });

  it('turns from 18° right to parallel by t_par and is parallel at t_ex', () => {
    expect(viewYaw(tr, 0)).toBeCloseTo(TRACK.yaw0, 6);
    for (let t = tr.tPar + TRACK.sample; t < tr.anchors.tPullBack; t += 0.5) expect(Math.abs(viewYaw(tr, t))).toBeLessThan(1e-9);
    expect(tr.pose(tr.tEx).yaw).toBe(0);
  });

  it('moves in during the opening, then pulls back and rises through Photos', () => {
    expect(tr.pose(0).pos[2]).toBeCloseTo(TRACK.d0, 9);
    expect(tr.pose(at(ex, 0.5)).pos[2]).toBeCloseTo(TRACK.dEx, 9);
    expect(tr.pose(tr.anchors.tPullBack).pos[2]).toBeCloseTo(TRACK.dFriends, 9);
    const end = tr.pose(photos.end).pos;
    expect(end[2]).toBeCloseTo(TRACK.dPhotosEnd, 9);
    expect(end[1]).toBeCloseTo(TRACK.eye + TRACK.eyeRise * (TRACK.dPhotosEnd - TRACK.dFriends), 9);
    let previous = 0;
    for (let t = tr.anchors.tPullBack; t <= photos.end; t += 0.25) {
      const z = tr.pose(t).pos[2];
      expect(z).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = z;
    }
  });

  it('holds in Location, moves in, then walks almost straight up to the LED wall', () => {
    const m = requireSegment(s, 'moments');
    const w = requireSegment(s, 'words');
    expect(tr.pose(at(m, 0.3)).pos[2] - TRACK.dark.wallZ).toBeCloseTo(TRACK.dPhotosEnd - TRACK.dark.wallZ, 6);
    expect(tr.pose(m.end).pos[2] - TRACK.dark.wallZ).toBeCloseTo(TRACK.dark.dEnd, 6);
    const led = tr.anchors.words!.center[2];
    expect(tr.pose(at(w, 0.1)).pos[2] - led).toBeCloseTo(10.5, 6);
    expect(tr.pose(w.end).pos[2] - led).toBeCloseTo(2.7, 6);
    const a = tr.pose(at(w, 0.3)).pos;
    const b = tr.pose(at(w, 0.76)).pos;
    expect(Math.abs(b[0] - a[0])).toBeLessThan(2.5);
    expect(a[2] - b[2]).toBeGreaterThan(2.5);
  });

  it('turns 30° right, then orbits the thumb at 6–8.7 m while the view turns 100° left', () => {
    const l = requireSegment(s, 'likes');
    const v = requireSegment(s, 'videos');
    const hall = tr.anchors.hall!;
    expect(tr.pose(at(l, TRACK.hall.turnEnd)).yaw).toBeCloseTo(TRACK.hall.turn, 9);
    expect(hall.orbitEnd).toBeCloseTo(at(v, TRACK.hall.orbitEndWithVideos), 9);
    for (let t = at(l, TRACK.hall.turnEnd); t <= hall.orbitEnd; t += 0.25) {
      const p = tr.pose(t).pos;
      const r = Math.hypot(p[0] - hall.thumb[0], p[2] - hall.thumb[2]);
      expect(r).toBeGreaterThan(TRACK.hall.r1 - 1e-6);
      expect(r).toBeLessThan(TRACK.hall.r0 + 1e-6);
    }
    expect(TRACK.hall.turn - tr.pose(hall.orbitEnd).yaw).toBeCloseTo(TRACK.hall.orbit - TRACK.hall.lookOffset, 9);
  });

  it('faces the Videos wall head-on at 9–14 m and trucks right along it', () => {
    const hall = tr.anchors.hall!;
    const endYaw = tr.pose(hall.orbitEnd).yaw;
    expect(hall.videosWall.yaw).toBeCloseTo(endYaw, 12);
    const p0 = tr.pose(hall.orbitEnd).pos;
    const ahead = dot(sub(hall.videosWall.origin, [p0[0], 0, p0[2]]), dirOf(endYaw));
    expect(ahead).toBeGreaterThan(9);
    expect(ahead).toBeLessThan(14);
    const robots = requireSegment(s, 'robots');
    const moved = sub(tr.pose(robots.start).pos, tr.pose(hall.orbitEnd + 1).pos);
    expect(dot(moved, rightOf(endYaw))).toBeGreaterThan(3);
    expect(Math.abs(dot(moved, dirOf(endYaw)))).toBeLessThan(1e-6);
  });

  it('goes straight ahead in the robot room: the sideways motion dies out and the approach speeds up', () => {
    const r = requireSegment(s, 'robots');
    const dive = requireSegment(s, 'dive');
    const F = tr.anchors.robots;
    const vel = (t: number): Vec3 => toLocalDir(F, scale(sub(tr.pose(t + 0.01).pos, tr.pose(t - 0.01).pos), 50));
    for (let t = at(r, 0.5); t < dive.start - 0.1; t += 0.5) expect(Math.abs(vel(t)[0])).toBeLessThan(0.05);
    expect(vel(at(r, 0.9))[2]).toBeLessThan(vel(at(r, 0.5))[2]);
    expect(toLocalDir(F, tr.exit.vel)[2]).toBeLessThan(0);
    expect(tr.pose(dive.start).focus).toBeCloseTo(TRACK.robots.dEnd, 1);
    const door = toLocal(F, tr.anchors.door.origin);
    expect(door[0]).toBeCloseTo(0, 9);
    expect(door[2]).toBeCloseTo(-TRACK.door.gap, 9);
  });

  it('lists the three wipes in order, with the dark pillar 1.6 m in front of the lens', () => {
    expect(tr.wipes.map((w) => w.name)).toEqual(['white-block', 'dark-pillar', 'robot-door']);
    for (const w of tr.wipes) expect(w.start < w.mid && w.mid < w.end).toBe(true);
    const pillar = tr.wipes[1];
    const p = tr.pose(pillar.mid).pos;
    expect(p[2] - tr.anchors.darkPillar![2]).toBeCloseTo(TRACK.darkPillar.gap, 9);
    expect(p[0]).toBeCloseTo(tr.anchors.darkPillar![0], 9);
  });

  it('switches the LED content at 0.41, 0.55, 0.57 and 0.79 of Words', () => {
    const w = requireSegment(s, 'words');
    expect(tr.ledSwitches).toEqual([0.41, 0.55, 0.57, 0.79].map((u) => at(w, u)));
  });

  it('whiteWalk is the white part of the full track', () => {
    const white = whiteWalk(s, TRACK.speed);
    for (let t = 0; t <= photos.end; t += 0.5) {
      expect(tr.pose(t).pos[0]).toBeCloseTo(white.xAt(t), 12);
      expect(tr.pose(t).pos[2]).toBeCloseTo(white.distanceAt(t), 12);
    }
  });
});

describe('computeTrack — every cut', () => {
  it('is continuous in position, velocity, view direction and focus up to the dive', () => {
    for (const c of CUTS) {
      const s = seq(c.mode, c.music);
      const tr = computeTrack(s, speedFor(s));
      const dive = requireSegment(s, 'dive');
      const dt = 1 / 30;
      let previous: Vec3 | null = null;
      for (let t = 0; t + dt <= dive.start; t += dt) {
        const step = sub(tr.pos.at(t + dt), tr.pos.at(t));
        // 9 m/s: the 90 s cut orbits the thumb in about 4 s; jumps show up in Δv below.
        expect(length(step), `${c.mode}/${c.music} t=${t.toFixed(2)} step`).toBeLessThan(0.3);
        const v = scale(step, 1 / dt);
        if (previous) expect(length(sub(v, previous)), `${c.mode}/${c.music} t=${t.toFixed(2)} Δv`).toBeLessThan(0.3);
        previous = v;
        expect(Math.abs(viewYaw(tr, t + dt) - viewYaw(tr, t)), `${c.mode}/${c.music} t=${t.toFixed(2)} yaw`).toBeLessThan(0.06);
        expect(Math.abs(tr.focus.at(t + dt) - tr.focus.at(t)), `${c.mode}/${c.music} t=${t.toFixed(2)} focus`).toBeLessThan(0.6);
      }
    }
  });

  it('slides the robot door fully out of the frame before removing it, within 3.5 s of full cover', () => {
    for (const c of CUTS) {
      const s = seq(c.mode, c.music);
      const tr = computeTrack(s, speedFor(s));
      const door = tr.wipes.find((w) => w.name === 'robot-door')!;
      const clear = TRACK.door.width / 2 + TRACK.door.gap * HALF_HFOV_TAN;
      const slid = toLocal(tr.anchors.robots, tr.pose(door.end).pos)[0] - toLocal(tr.anchors.robots, tr.pose(door.mid).pos)[0];
      expect(Math.abs(slid), `${c.mode}/${c.music} door still in frame when removed`).toBeGreaterThan(clear);
      expect(door.end - door.mid, `${c.mode}/${c.music} reveal`).toBeLessThan(3.5);
    }
  });

  it('the 30 s cut has only the robot door; LED switches exist only with Words', () => {
    const s = seq(30);
    const tr = computeTrack(s, speedFor(s));
    expect(tr.wipes.map((w) => w.name)).toEqual(['robot-door']);
    expect(tr.ledSwitches).toEqual([]);
    expect(tr.anchors.hall).toBeNull();
    expect(tr.anchors.dark).toBeNull();
  });

  it('the 60 s cut turns right at the end of Words and enters the robot room from there', () => {
    const s = seq(60);
    const tr = computeTrack(s, speedFor(s));
    const r = requireSegment(s, 'robots');
    expect(tr.anchors.hall).toBeNull();
    expect(tr.pose(r.start).yaw).toBeCloseTo(TRACK.hall.turn, 9);
    expect(tr.anchors.robots.yaw).toBeCloseTo(TRACK.hall.turn, 9);
  });
});
