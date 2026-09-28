# The Museum of Me v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild 0–150 s of the film on the camera track and gallery layout measured from the original (spec v4), and fold in the six v3-review fixes.

**Architecture:**
- **Camera track** (`camera/track.ts`): a pure, piecewise analytic function of time, one region per room, with the measured distances, speeds and turns. It is sampled into Hermite splines for the camera and also yields the anchors (walls, thumb, frames).
- **Gallery layout** (`stage/gallery.ts`): places walls, blocks, labels and exhibits from those anchors.
  - Rotated areas (the hall walls, the robot room and the finale) live in local `Frame`s.
  - The robot room is swapped in behind a full-frame dark partition, so it may overlap earlier space.
- **Switch-over:** new world builders in `stage/gallery/` and a new `camera/gallery-path.ts` are built alongside v3, then Task 10 switches the project over and deletes the v3 strip, world and path.

**Tech Stack:** TypeScript 5.9, three.js 0.186, postprocessing 6.39, Vite 8, Vitest 5, Playwright 1.63 (system Chrome), Python 3 + OpenCV 4.8 + NumPy (measurement scripts), ffmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-09-28-museum-of-me-v4-design.md` (with v3 and v2 specs for the parts v4 does not replace).

## Global Constraints

- **No branding or bundled music:** no Intel, Core or Facebook logos or brand screens; no bundled Nijiko recording or melody.
- **Browser-only:** photos never leave the machine. The Python scripts are developer tools only (acceptance), never part of the app.
- **Traditional Chinese UI text** throughout.
- **Determinism:** `renderFrame(t)` is a pure function of t; every random choice comes from a seeded `mulberry32`. Scrubbing backwards must give the same frame.
- **One take, only three wipes:**
  - no cut and no whole-picture fade from 0 to the end of the network;
  - the only partition wipes are the white block (after the intro), the dark pillar (Photos → dark rooms) and the dark door (before the robot room).
- **Lens:** vertical FOV 38° everywhere before the ending card. Focus changes smoothly, with no jump in any frame.
- **Timeline source:** the timeline, segment ids and preset lists stay as in v3 (`plan/sequence.ts`). The 20-photo auto timeline equals the original's seconds.
- **Estimated values:** values the spec marks 「（估）」 are tuned only in Task 11, against the side-by-side and motion reports.

## Review Focus

1. **Every cut** (auto, 30/60/90/120 s, music 46/74/104/300 s) has a continuous track, no crossing walls, and a camera that never enters a wall or obstacle. Task 3 (continuity for all cuts), Task 4 (walls never cross, clearance for all cuts) and Task 9 (obstacles through the dive for all cuts) cover this.
2. **Very long cuts** (music 300 s) keep the LED rows inside their texture and the grid swap table long enough. Task 6 (LED offsets for 300 s) and Task 4 (grid table covers the hall) cover this.
3. **3 photos and 500 photos:** the grid, CRTs, Location boxes, network, carpet and swarm stay valid. Task 4 (three photos, 500 photos) and Task 7 (grid materials for 3 photos) cover this.
4. **Scrubbing backwards or out of order** gives the same grid photos and LED offsets. Task 6 and Task 7 (updates are pure in t) cover this.
5. **The robot room swap** never shows both spaces, and the door never blocks the camera after its wipe. Task 8 (visibility by time) and Task 9 (obstacles respect `until`) cover this.

---

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/measure-motion.py` | Per-second flow, zoom and rotation of any film (developer tool) |
| `scripts/compare-motion.py` | Section-by-section comparison against the original, as a Markdown report with an exit status |
| `scripts/original-motion.json` | The spec §1 sections in original seconds |
| `src/stage/frame.ts` | `Frame`, `dirOf`, `rightOf`, `toWorld`, `toLocal`, `placeIn`, `child` |
| `src/camera/curve.ts` | 1D Hermite curve and running integral |
| `src/camera/track.ts` | `TRACK` constants, `whiteWalk`, `computeTrack` (regions, anchors, wipes, LED switch times, smoothed splines) |
| `src/stage/gallery.ts` | `computeGallery` (layout from the track), `gallerySpeed`, text fit, `TEXT`, `HALL`, `ROBOTS`, `CARPET` |
| `src/stage/gallery/context.ts`, `common.ts` | Content and context types, labels, visitors |
| `src/stage/gallery/shell.ts` | Walls, floors and blocks per region |
| `src/stage/gallery/rooms/{wall,portraits,photos,location,words,hall,robots}.ts` | Room builders |
| `src/stage/gallery/finale.ts` | Carpet → mosaic → network → card, in the robot frame |
| `src/stage/gallery/world.ts` | Assembly, region visibility, bloom by time |
| `src/stage/parts/crt.ts` | Old tube TV on a stand |
| `src/camera/gallery-path.ts` | `CameraPath` from the track, then the dive and finale in the robot frame |
| `tests/unit/fake-gallery.ts` | Test context |

---

### Task 1: Motion measurement tools

**Files:**
- Create: `scripts/measure-motion.py`, `scripts/compare-motion.py`, `scripts/original-motion.json`
- Test: `tests/unit/motion-tools.test.ts`

**Interfaces:**
- Produces: `python3 scripts/measure-motion.py VIDEO OUT.csv [--end S] [--rate R]` writes one CSV row per second, with columns `second,tx,ty,zoom,rot,inliers`.
  - `tx`, `ty`: px/s at 720 lines. `tx < 0` means the picture moves left.
  - `zoom`: per second, `> 1` means the camera moves in.
- Produces: `python3 scripts/compare-motion.py ORIGINAL.csv OURS.csv TABLE.json REPORT.md` writes a Markdown table. It exits 1 if any section fails.

- [ ] **Step 1: Write the failing test `tests/unit/motion-tools.test.ts`**

```ts
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ok = (cmd: string, args: string[]) => spawnSync(cmd, args).status === 0;
const ready = ok('ffmpeg', ['-version']) && ok('python3', ['-c', 'import cv2, numpy']);
const dir = mkdtempSync(path.join(tmpdir(), 'motion-'));
const photo = path.resolve('tests/fixtures/photo-1.jpg');

function film(name: string, filter: string): string {
  const video = path.join(dir, name);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', photo, '-t', '3', '-r', '30', '-vf', filter, '-pix_fmt', 'yuv420p', video]);
  return video;
}

function measure(video: string): { second: number; tx: number; zoom: number }[] {
  const out = `${video}.csv`;
  execFileSync('python3', ['scripts/measure-motion.py', video, out]);
  return readFileSync(out, 'utf8').trim().split('\n').slice(1).map((line) => {
    const [second, tx, , zoom] = line.split(',').map(Number);
    return { second, tx, zoom };
  });
}

describe.skipIf(!ready)('motion tools', () => {
  it('a window sliding right over a still reads as the picture moving left, with no zoom', () => {
    const rows = measure(film('pan.mp4', "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,crop=1280:720:'150*t':300"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows.filter((x) => x.second >= 1)) {
      expect(r.tx).toBeLessThan(-110);
      expect(r.tx).toBeGreaterThan(-190);
      expect(Math.abs(Math.log(r.zoom))).toBeLessThan(0.03);
    }
  });

  it('a zoom into a still reads as zoom above 1', () => {
    const rows = measure(film('zoom.mp4', "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,zoompan=z='1+0.004*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=30"));
    for (const r of rows.filter((x) => x.second >= 1)) expect(r.zoom).toBeGreaterThan(1.05);
  });

  it('compare-motion passes matching sections and fails opposite motion', () => {
    const csv = (rows: [number, number, number][]) =>
      'second,tx,ty,zoom,rot,inliers\n' + rows.map(([s, tx, z]) => `${s},${tx},0,${z},0,500`).join('\n') + '\n';
    const orig = path.join(dir, 'o.csv');
    const ours = path.join(dir, 'u.csv');
    const table = path.join(dir, 't.json');
    const report = path.join(dir, 'r.md');
    writeFileSync(orig, csv([[0, -140, 1], [1, -140, 1], [2, 50, 1.05], [3, 50, 1.05]]));
    writeFileSync(ours, csv([[0, -120, 1.01], [1, -150, 1], [2, -60, 0.95], [3, -60, 0.95]]));
    writeFileSync(table, JSON.stringify([{ name: 'truck', from: 0, to: 2 }, { name: 'orbit', from: 2, to: 4 }]));
    const run = spawnSync('python3', ['scripts/compare-motion.py', orig, ours, table, report]);
    expect(run.status).toBe(1);
    const md = readFileSync(report, 'utf8');
    expect(md).toMatch(/\| truck \|.*\| pass \|/);
    expect(md).toMatch(/\| orbit \|.*FAIL/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/motion-tools.test.ts`
Expected: FAIL. The Python scripts don't exist yet (`can't open file .../scripts/measure-motion.py`).

- [ ] **Step 3: Write `scripts/measure-motion.py`**

```python
#!/usr/bin/env python3
"""Per-second camera motion of a letterboxed film.

Usage: measure-motion.py VIDEO OUT.csv [--end SECONDS] [--rate SAMPLES_PER_SECOND]

One row per whole second: second,tx,ty,zoom,rot,inliers
  tx, ty  median feature flow in px/s at 720 lines (tx < 0: the picture moves left,
          i.e. the camera trucks or pans right)
  zoom    per-second scale change of the picture (> 1: the camera moves in)
  rot     median in-plane rotation, degrees per second
Seconds without a single matched sample are written as NaN.
"""
import argparse
import math
import sys

import cv2
import numpy as np


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('out')
    ap.add_argument('--end', type=float, default=1e9)
    ap.add_argument('--rate', type=float, default=10.0)
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f'cannot open {args.video}', file=sys.stderr)
        return 2
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(fps / args.rate))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # Inside the 2.35:1 letterbox, clear of its edges.
    y0, y1 = int(height * 0.19), int(height * 0.81)
    px = 720.0 / height
    per_second = fps / step

    orb = cv2.ORB_create(3000)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    clahe = cv2.createCLAHE(3.0, (8, 8))
    samples = []  # (t, scale or nan, tx, ty, rot, inliers)
    prev = None
    index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = index / fps
        if t > args.end:
            break
        if index % step == 0:
            gray = clahe.apply(cv2.cvtColor(frame[y0:y1], cv2.COLOR_BGR2GRAY))
            kp, des = orb.detectAndCompute(gray, None)
            row = (t, math.nan, math.nan, math.nan, math.nan, 0)
            if prev is not None and des is not None and prev[1] is not None and len(kp) >= 20:
                matches = matcher.match(prev[1], des)
                if len(matches) >= 20:
                    a = np.float32([prev[0][m.queryIdx].pt for m in matches])
                    b = np.float32([kp[m.trainIdx].pt for m in matches])
                    M, inliers = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                    if M is not None and int(inliers.sum()) >= 15:
                        s = math.hypot(M[0, 0], M[1, 0])
                        rot = math.degrees(math.atan2(M[1, 0], M[0, 0]))
                        row = (t, s, M[0, 2] * px * per_second, M[1, 2] * px * per_second, rot * per_second, int(inliers.sum()))
            if prev is not None:
                samples.append(row)
            prev = (kp, des)
        index += 1

    with open(args.out, 'w') as out:
        out.write('second,tx,ty,zoom,rot,inliers\n')
        if samples:
            for sec in range(int(samples[-1][0]) + 1):
                rows = [r for r in samples if sec <= r[0] < sec + 1 and not math.isnan(r[1])]
                if not rows:
                    out.write(f'{sec},nan,nan,nan,nan,0\n')
                    continue
                zoom = math.exp(sum(math.log(r[1]) for r in rows) / len(rows) * per_second)
                med = lambda k: float(np.median([r[k] for r in rows]))
                out.write(f'{sec},{med(2):.2f},{med(3):.2f},{zoom:.5f},{med(4):.3f},{int(med(5))}\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 4: Write `scripts/compare-motion.py`**

```python
#!/usr/bin/env python3
"""Compares our film's motion with the original's over the sections of a table.

Usage: compare-motion.py ORIGINAL.csv OURS.csv TABLE.json REPORT.md
TABLE: [{"name": ..., "from": s, "to": s}, ...] in seconds (our 20-photo auto timeline matches the original's).
A section passes when
  - the median tx has the same sign in both films, or both stay below 20 px/s, and
  - the cumulative zoom differs by at most 25 % (or both stay within ±5 %).
Exit status 1 when any section fails.
"""
import csv
import json
import math
import sys


def load(path):
    rows = {}
    with open(path) as f:
        for r in csv.DictReader(f):
            rows[int(r['second'])] = (float(r['tx']), float(r['zoom']))
    return rows


def section(rows, a, b):
    tx = sorted(rows[s][0] for s in range(a, b) if s in rows and not math.isnan(rows[s][0]))
    zs = [rows[s][1] for s in range(a, b) if s in rows and not math.isnan(rows[s][1])]
    if not tx or not zs:
        return None
    zoom = math.exp(sum(math.log(z) for z in zs) * (b - a) / len(zs))
    return tx[len(tx) // 2], zoom


def verdict(o, u):
    if o is None or u is None:
        return False, 'no data'
    (otx, oz), (utx, uz) = o, u
    tx_ok = (abs(otx) < 20 and abs(utx) < 20) or otx * utx > 0
    small = lambda z: abs(math.log(z)) <= math.log(1.05)
    zoom_ok = (small(oz) and small(uz)) or abs(math.log(uz / oz)) <= math.log(1.25)
    notes = []
    if not tx_ok:
        notes.append('sideways motion differs')
    if not zoom_ok:
        notes.append('depth motion differs')
    return tx_ok and zoom_ok, ', '.join(notes)


def main():
    if len(sys.argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    orig, ours = load(sys.argv[1]), load(sys.argv[2])
    with open(sys.argv[3]) as f:
        table = json.load(f)
    lines = ['| section | seconds | original tx | ours tx | original zoom | ours zoom | result |', '|---|---|---|---|---|---|---|']
    failed = 0
    for row in table:
        a, b = int(row['from']), int(row['to'])
        o, u = section(orig, a, b), section(ours, a, b)
        ok, why = verdict(o, u)
        failed += 0 if ok else 1
        cell = lambda v, k, f: '—' if v is None else format(v[k], f)
        result = 'pass' if ok else 'FAIL: ' + why
        lines.append(f"| {row['name']} | {a}–{b} | {cell(o, 0, '.0f')} | {cell(u, 0, '.0f')} | {cell(o, 1, '.2f')} | {cell(u, 1, '.2f')} | {result} |")
    with open(sys.argv[4], 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 5: Write `scripts/original-motion.json`**

```json
[
  { "name": "opening: turn parallel and move in", "from": 0, "to": 10 },
  { "name": "white wall: constant truck", "from": 10, "to": 31 },
  { "name": "Friends → Photos: pull back and rise", "from": 32, "to": 53 },
  { "name": "Location: truck and move in", "from": 57, "to": 64 },
  { "name": "Words: walk up to the LED wall", "from": 66, "to": 91 },
  { "name": "turn right off the LED wall", "from": 92, "to": 94 },
  { "name": "hall: orbit the thumb", "from": 95, "to": 112 },
  { "name": "Videos wall: constant truck", "from": 113, "to": 121 },
  { "name": "robot room: straight ahead", "from": 128, "to": 150 }
]
```

- [ ] **Step 6: Run and confirm it passes**

Run: `npx vitest run tests/unit/motion-tools.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add scripts/measure-motion.py scripts/compare-motion.py scripts/original-motion.json tests/unit/motion-tools.test.ts
git commit -m "feat(v4): motion measurement and comparison scripts"
```

---

### Task 2: Frames and 1D curves

**Files:**
- Create: `src/stage/frame.ts`, `src/camera/curve.ts`
- Test: `tests/unit/frame.test.ts`

**Interfaces:**
- Produces (`src/stage/frame.ts`):
  - `interface Frame { origin: Vec3; yaw: number }` and `IDENTITY`.
  - `dirOf(yaw)`, `rightOf(yaw)`: yaw 0 looks along −z; positive yaw turns right, toward +x.
  - Vector helpers `add`, `sub`, `scale`, `dot`, `length`.
  - `toWorld(f, p)`, `toWorldDir(f, v)`, `toLocal(f, p)`, `toLocalDir(f, v)`, `yawOf(v)`, `placeIn(f, obj)`, `child(parent, localOrigin, yawOffset)`.
  - Walls in a frame lie in its local xy plane and face local +z. A camera looking along `dirOf(frame.yaw)` sees them head-on.
- Produces (`src/camera/curve.ts`): `interface CurveKey { t; v; slope? }`, `interface Curve { at(t): number }`, `curve(keys)`, `integral(f, t0, t1, steps?)`.

- [ ] **Step 1: Write the failing test `tests/unit/frame.test.ts`**

```ts
import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { curve, integral } from '../../src/camera/curve';
import { child, dirOf, dot, placeIn, rightOf, toLocal, toLocalDir, toWorld, toWorldDir, yawOf, type Frame } from '../../src/stage/frame';
import type { Vec3 } from '../../src/types';

const close = (a: Vec3, b: Vec3, digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('frame', () => {
  const f: Frame = { origin: [3, 0.5, -2], yaw: 0.7 };

  it('yaw 0 looks along −z; positive yaw turns right', () => {
    close(dirOf(0), [0, 0, -1]);
    close(rightOf(0), [1, 0, 0]);
    close(dirOf(Math.PI / 2), [1, 0, 0]);
    expect(dot(dirOf(0.3), rightOf(0.3))).toBeCloseTo(0, 12);
  });

  it('local −z is the view direction and local +x the right hand', () => {
    close(toWorldDir(f, [0, 0, -1]), dirOf(f.yaw));
    close(toWorldDir(f, [1, 0, 0]), rightOf(f.yaw));
  });

  it('round-trips local ↔ world', () => {
    const p: Vec3 = [1.5, 2, -4];
    close(toLocal(f, toWorld(f, p)), p);
    close(toLocalDir(f, toWorldDir(f, p)), p);
  });

  it('placeIn gives three.js the same transform as toWorld', () => {
    const o = placeIn(f, new Object3D());
    o.updateMatrixWorld();
    const p = new Vector3(1, 2, 3).applyMatrix4(o.matrixWorld);
    close(p.toArray() as Vec3, toWorld(f, [1, 2, 3]));
  });

  it('yawOf inverts dirOf, and child frames compose', () => {
    expect(yawOf(dirOf(-1.2))).toBeCloseTo(-1.2, 12);
    const c = child(f, [2, 0, 0], 0.4);
    expect(c.yaw).toBeCloseTo(1.1, 12);
    close(c.origin, toWorld(f, [2, 0, 0]));
  });
});

describe('curve', () => {
  it('passes through its keys with the given slopes', () => {
    const c = curve([{ t: 0, v: 1, slope: 0 }, { t: 2, v: 3 }, { t: 4, v: 2, slope: 0 }]);
    expect(c.at(0)).toBe(1);
    expect(c.at(2)).toBeCloseTo(3, 12);
    expect(c.at(9)).toBeCloseTo(2, 12);
    expect((c.at(1e-6) - c.at(0)) / 1e-6).toBeCloseTo(0, 3);
  });

  it('integral of a constant grows linearly and clamps outside', () => {
    const x = integral(() => 2, 1, 5);
    expect(x.at(1)).toBe(0);
    expect(x.at(3)).toBeCloseTo(4, 9);
    expect(x.at(9)).toBeCloseTo(8, 9);
    expect(x.at(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/frame.test.ts`
Expected: FAIL (cannot find module `../../src/camera/curve`).

- [ ] **Step 3: Write `src/stage/frame.ts`**

```ts
import type { Object3D } from 'three';
import type { Vec3 } from '../types';

/**
 * A horizontal frame. Local −z is the view direction `dirOf(yaw)`, local +x is `rightOf(yaw)`, y is up.
 * Walls in a frame lie in its local xy plane and face local +z, so a camera looking along `dirOf(yaw)` sees them head-on.
 */
export interface Frame {
  origin: Vec3;
  yaw: number;
}

export const IDENTITY: Frame = { origin: [0, 0, 0], yaw: 0 };

/** Unit view direction for a heading: yaw 0 looks along −z, positive yaw turns right (towards +x). */
export const dirOf = (yaw: number): Vec3 => [Math.sin(yaw), 0, -Math.cos(yaw)];
export const rightOf = (yaw: number): Vec3 => [Math.cos(yaw), 0, Math.sin(yaw)];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export function toWorldDir(f: Frame, v: Vec3): Vec3 {
  const r = rightOf(f.yaw);
  const d = dirOf(f.yaw);
  return [v[0] * r[0] - v[2] * d[0], v[1], v[0] * r[2] - v[2] * d[2]];
}

export const toWorld = (f: Frame, p: Vec3): Vec3 => add(f.origin, toWorldDir(f, p));

export function toLocalDir(f: Frame, v: Vec3): Vec3 {
  const r = rightOf(f.yaw);
  const d = dirOf(f.yaw);
  return [v[0] * r[0] + v[2] * r[2], v[1], -(v[0] * d[0] + v[2] * d[2])];
}

export const toLocal = (f: Frame, p: Vec3): Vec3 => toLocalDir(f, sub(p, f.origin));

/** Heading of a world direction projected on the ground. */
export const yawOf = (v: Vec3): number => Math.atan2(v[0], -v[2]);

/** Places a three.js object so that its local axes are the frame's. */
export function placeIn<T extends Object3D>(f: Frame, obj: T): T {
  obj.position.set(f.origin[0], f.origin[1], f.origin[2]);
  obj.rotation.set(0, -f.yaw, 0);
  return obj;
}

/** A frame at `localOrigin` of `parent`, turned by `yawOffset` relative to it. */
export const child = (parent: Frame, localOrigin: Vec3, yawOffset = 0): Frame => ({ origin: toWorld(parent, localOrigin), yaw: parent.yaw + yawOffset });
```

- [ ] **Step 4: Write `src/camera/curve.ts`**

```ts
import type { Vec3 } from '../types';
import { createSpline } from './spline';

export interface CurveKey {
  t: number;
  v: number;
  /** Explicit slope; otherwise Catmull-Rom inside and zero at the ends. */
  slope?: number;
}

export interface Curve {
  at(t: number): number;
}

export function curve(keys: CurveKey[]): Curve {
  const spline = createSpline(keys.map((k) => ({ t: k.t, value: [k.v, 0, 0] as Vec3, ...(k.slope === undefined ? {} : { velocity: [k.slope, 0, 0] as Vec3 }) })));
  return { at: (t) => spline.at(t)[0] };
}

/** Running integral of `f` from `t0` (trapezoids); constant outside [t0, t1]. */
export function integral(f: (t: number) => number, t0: number, t1: number, steps = 400): Curve {
  if (!(t1 > t0)) return { at: () => 0 };
  const h = (t1 - t0) / steps;
  const acc = [0];
  for (let i = 1; i <= steps; i++) acc.push(acc[i - 1] + ((f(t0 + (i - 1) * h) + f(t0 + i * h)) / 2) * h);
  return {
    at(t) {
      const u = Math.min(steps, Math.max(0, (t - t0) / h));
      const i = Math.min(steps - 1, Math.floor(u));
      return acc[i] + (acc[i + 1] - acc[i]) * (u - i);
    },
  };
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run tests/unit/frame.test.ts && npx tsc --noEmit`
Expected: PASS (7 passed), type check clean.

- [ ] **Step 6: Commit**

```bash
git add src/stage/frame.ts src/camera/curve.ts tests/unit/frame.test.ts
git commit -m "feat(v4): horizontal frames and 1D curves"
```

---
### Task 3: Camera track

**Files:**
- Create: `src/camera/track.ts`
- Test: `tests/unit/track.test.ts`

**Interfaces:**
- Consumes: `curve`, `integral` (Task 2); `Frame`, `dirOf`, `rightOf`, `toWorld`, `add`, `sub`, `scale`, `dot` (Task 2); `SEQUENCE_BASE`, `findSegment`, `requireSegment` (`plan/sequence.ts`); `createSpline` (`camera/spline.ts`).
- Produces:
  - Constants `TRACK` and `HALF_HFOV_TAN`.
  - `interface WhiteWalk { tTitle; tPar; tEx; tIntro: number | null; tPullBack; photosStart; blockX0: number | null; yawAt(t); distanceAt(t); xAt(t) }` and `whiteWalk(sequence, V): WhiteWalk`.
  - `interface WalkPose { pos: Vec3; yaw: number; focus: number }`.
  - `interface Wipe { name: 'white-block' | 'dark-pillar' | 'robot-door'; mid; start; end }`.
  - `interface HallAnchors { thumb: Vec3; turnYaw: number; orbitEnd: number; likesWall: Frame; gridWall: Frame; videosWall: Frame }`.
  - `interface TrackAnchors`, with fields:
    - `tPullBack`, `whiteWallEnd`, `settle`, `platformZ`;
    - `whiteBlock: { x0; x1; depth } | null`;
    - `dark: { wallZ; x0 } | null`;
    - `words: { center: Vec3; width; height; recess: [number, number] } | null`;
    - `hall: HallAnchors | null`, `darkPillar: Vec3 | null`;
    - `door: Frame`, `robots: Frame`.
  - `interface Track { speed; tPar; tEx; pose(t): WalkPose; pos: Spline; target: Spline; focus: Curve; exit: { pos: Vec3; vel: Vec3 }; anchors: TrackAnchors; wipes: Wipe[]; ledSwitches: number[] }` and `computeTrack(sequence, V): Track`.
  - The track covers 0 → `dive.start`. All positions are in world coordinates, and the white wall is the plane z = 0.

- [ ] **Step 1: Write the failing test `tests/unit/track.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TRACK, computeTrack, whiteWalk } from '../../src/camera/track';
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

  it('faces the Videos wall head-on at 9.7 m and trucks right along it', () => {
    const hall = tr.anchors.hall!;
    const endYaw = tr.pose(hall.orbitEnd).yaw;
    expect(hall.videosWall.yaw).toBeCloseTo(endYaw, 12);
    const p0 = tr.pose(hall.orbitEnd).pos;
    expect(dot(sub(hall.videosWall.origin, [p0[0], 0, p0[2]]), dirOf(endYaw))).toBeCloseTo(TRACK.hall.videosWall, 9);
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
        expect(length(step), `${c.mode}/${c.music} t=${t.toFixed(2)} step`).toBeLessThan(0.25);
        const v = scale(step, 1 / dt);
        if (previous) expect(length(sub(v, previous)), `${c.mode}/${c.music} t=${t.toFixed(2)} Δv`).toBeLessThan(0.3);
        previous = v;
        expect(Math.abs(viewYaw(tr, t + dt) - viewYaw(tr, t)), `${c.mode}/${c.music} t=${t.toFixed(2)} yaw`).toBeLessThan(0.06);
        expect(Math.abs(tr.focus.at(t + dt) - tr.focus.at(t)), `${c.mode}/${c.music} t=${t.toFixed(2)} focus`).toBeLessThan(0.6);
      }
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/track.test.ts`
Expected: FAIL (cannot find module `../../src/camera/track`).

- [ ] **Step 3: Write `src/camera/track.ts`**

```ts
import { SEQUENCE_BASE, findSegment, requireSegment } from '../plan/sequence';
import { add, dirOf, dot, rightOf, scale, sub, toWorld, type Frame } from '../stage/frame';
import type { Segment, Sequence, Vec3 } from '../types';
import { lerp, smoothstep } from '../util/math';
import { curve, integral, type Curve, type CurveKey } from './curve';
import { createSpline, type Spline } from './spline';

const deg = (d: number): number => (d * Math.PI) / 180;
/** tan of half the horizontal field of view (16:9 frame, 38° vertical). */
export const HALF_HFOV_TAN = Math.tan(deg(19)) * (16 / 9);

/** Camera track measured on the original film (spec v4 §1). Metres, seconds, radians. */
export const TRACK = {
  speed: 0.95,
  fov: 38,
  yaw0: deg(18),
  look: 10,
  eye: 1.3,
  eyeRise: 0.18,
  d0: 8.5,
  dEx: 6.1,
  dFriends: 7.0,
  dPhotosStart: 8.7,
  dPhotosMid: 12.8,
  dPhotosEnd: 14.6,
  pullBackSpeed: 0.85,
  pullBackEase: 2,
  whiteBlock: { at: 0.16, width: 1.2, gap: 1.6 },
  darkPillar: { after: 1.0, gap: 1.6, width: 1.1 },
  dark: { wallZ: 5.2, eye: 1.5, dEnd: 7.2, speed: 1.2, wallEndPastCamera: 2.6 },
  words: {
    /** Distance to the LED wall by fraction of the segment (original 63–92 s, from the zoom track). */
    d: [[0, 10.9], [0.1, 10.5], [0.24, 9.0], [0.41, 7.4], [0.59, 6.4], [0.76, 4.7], [0.86, 3.6], [0.97, 2.8], [1, 2.7]],
    /** Sideways speed in m/s at the original pace, by fraction. */
    drift: [[0, 1.1], [0.1, 0.45], [0.24, 0.35], [0.3, 0.15], [0.76, 0.13], [0.86, 0.45], [1, 0.6]],
    ledWidth: 10,
    ledHeight: 3.6,
    ledY: 2.0,
    /** The LED wall's right end, past the camera x at the end of Words. */
    rightMargin: 1.1,
    recessMargin: 0.5,
    switches: [0.41, 0.55, 0.57, 0.79],
  },
  hall: {
    turn: deg(30),
    turnEnd: 0.1,
    r0: 8.7,
    r1: 6,
    orbit: deg(130),
    lookOffset: deg(30),
    videosWall: 9.7,
    videosHalfWidth: 5.0,
    gridTurn: deg(50),
    gridLength: 7,
    likesTurn: deg(100),
    likesLength: 16,
    orbitEndWithVideos: 0.4,
    orbitEndWithoutVideos: 0.75,
  },
  truck: { videos: 0.75, ramp: 1.5 },
  /** Wide enough to cover the whole frame at 1.6 m, so the robot room can be swapped in behind it. */
  door: { gap: 1.6, width: 2.2 },
  robots: { dStart: 12.6, dEnd: 8, eye: 1.6, eyeBlend: 0.1, approachFrom: 0.1, settle: 1.0 },
  sample: 0.25,
} as const;

export interface WalkPose {
  pos: Vec3;
  yaw: number;
  /** Distance to what the original keeps sharp: the wall ahead, the thumb, the platform. */
  focus: number;
}

export interface Wipe {
  name: 'white-block' | 'dark-pillar' | 'robot-door';
  mid: number;
  start: number;
  end: number;
}

export interface HallAnchors {
  thumb: Vec3;
  turnYaw: number;
  orbitEnd: number;
  likesWall: Frame;
  gridWall: Frame;
  videosWall: Frame;
}

export interface TrackAnchors {
  tPullBack: number;
  whiteBlock: { x0: number; x1: number; depth: number } | null;
  whiteWallEnd: number;
  dark: { wallZ: number; x0: number } | null;
  words: { center: Vec3; width: number; height: number; recess: [number, number] } | null;
  hall: HallAnchors | null;
  darkPillar: Vec3 | null;
  door: Frame;
  robots: Frame;
  /** Camera x (robot frame) once the sideways motion has died out. */
  settle: number;
  platformZ: number;
}

export interface Track {
  speed: number;
  tPar: number;
  tEx: number;
  /** The analytic walk, piecewise by room (unsmoothed). */
  pose(t: number): WalkPose;
  /** Smoothed camera position, look target and focus from 0 to the dive. */
  pos: Spline;
  target: Spline;
  focus: Curve;
  exit: { pos: Vec3; vel: Vec3 };
  anchors: TrackAnchors;
  wipes: Wipe[];
  ledSwitches: number[];
}

const at = (s: Segment, u: number): number => s.start + u * (s.end - s.start);
const pace = (s: Segment): number => SEQUENCE_BASE[s.id] / (s.end - s.start);

export interface WhiteWalk {
  tTitle: number;
  tPar: number;
  tEx: number;
  tIntro: number | null;
  tPullBack: number;
  photosStart: number;
  /** Left face of the white block the camera passes after the intro (null without Friends). */
  blockX0: number | null;
  yawAt(t: number): number;
  distanceAt(t: number): number;
  xAt(t: number): number;
}

/** The white-wall part of the walk (original 0–53 s), cheap enough for the speed fit. */
export function whiteWalk(sequence: Sequence, V: number): WhiteWalk {
  const title = requireSegment(sequence, 'title');
  const exhibition = requireSegment(sequence, 'exhibition');
  const intro = findSegment(sequence, 'intro');
  const portraits = findSegment(sequence, 'portraits');
  const photos = requireSegment(sequence, 'photos');
  const tPar = at(exhibition, 0.2);
  const tPullBack = portraits ? at(portraits, 0.56) : photos.start;
  const keys: CurveKey[] = [
    { t: 0, v: TRACK.d0, slope: 0 },
    { t: at(exhibition, 0.5), v: TRACK.dEx, slope: 0 },
    { t: tPullBack, v: TRACK.dFriends, slope: 0 },
  ];
  if (portraits) keys.push({ t: photos.start, v: TRACK.dPhotosStart });
  keys.push({ t: at(photos, 0.6), v: TRACK.dPhotosMid }, { t: photos.end, v: TRACK.dPhotosEnd, slope: 0 });
  const D = curve(keys);
  const pb = TRACK.pullBackSpeed;
  const tau = TRACK.pullBackEase;
  const xAt = (t: number): number => {
    if (t <= tPullBack) return V * t;
    const d = t - tPullBack;
    return V * tPullBack + V * (pb * d + (1 - pb) * tau * (1 - Math.exp(-d / tau)));
  };
  return {
    tTitle: at(title, 0.3),
    tPar,
    tEx: at(exhibition, 0.55),
    tIntro: intro ? at(intro, 0.5) : null,
    tPullBack,
    photosStart: photos.start,
    blockX0: portraits ? xAt(at(portraits, TRACK.whiteBlock.at)) - TRACK.whiteBlock.width / 2 : null,
    yawAt: (t) => TRACK.yaw0 * (1 - smoothstep(0, tPar, t)),
    distanceAt: (t) => D.at(t),
    xAt,
  };
}

export function computeTrack(sequence: Sequence, V: number): Track {
  const white = whiteWalk(sequence, V);
  const portraits = findSegment(sequence, 'portraits');
  const photos = requireSegment(sequence, 'photos');
  const moments = findSegment(sequence, 'moments');
  const words = findSegment(sequence, 'words');
  const likes = findSegment(sequence, 'likes');
  const videos = findSegment(sequence, 'videos');
  const robots = requireSegment(sequence, 'robots');
  const dive = requireSegment(sequence, 'dive');

  const regions: { start: number; end: number; pose: (t: number) => WalkPose }[] = [];
  const poseAt = (t: number): WalkPose => {
    for (const r of regions) if (t <= r.end) return r.pose(Math.max(t, r.start));
    const last = regions[regions.length - 1];
    return last.pose(last.end);
  };
  const velBefore = (t: number): Vec3 => scale(sub(poseAt(t).pos, poseAt(t - 1e-3).pos), 1e3);

  // White wall and the Photos pull-back (original 0–53 s).
  regions.push({
    start: 0,
    end: photos.end,
    pose: (t) => {
      const d = white.distanceAt(t);
      const yaw = white.yawAt(t);
      const y = t <= white.tPullBack ? TRACK.eye : TRACK.eye + TRACK.eyeRise * Math.max(0, d - TRACK.dFriends);
      return { pos: [white.xAt(t), y, d], yaw, focus: d / Math.cos(yaw) };
    },
  });
  const pe = poseAt(photos.end);
  const hasDark = !!(moments || words);
  const whiteWallEnd = hasDark ? pe.pos[0] + TRACK.dark.wallEndPastCamera : white.xAt(robots.start) + 20;

  // Location: hold, then move in on the shallow wall (original 53–63 s).
  if (moments) {
    const m = moments;
    const x0 = pe.pos[0];
    const v0 = velBefore(photos.end)[0];
    const x = integral((t) => lerp(v0, TRACK.dark.speed * V, smoothstep(m.start, at(m, 0.3), t)), m.start, m.end);
    const z = curve([
      { t: m.start, v: pe.pos[2], slope: 0 },
      { t: at(m, 0.4), v: pe.pos[2], slope: 0 },
      { t: m.end, v: TRACK.dark.wallZ + TRACK.dark.dEnd },
    ]);
    regions.push({
      start: m.start,
      end: m.end,
      pose: (t) => {
        const zz = z.at(t);
        // Focus moves from the white wall to the nearer Location wall behind the dark pillar.
        const focus = lerp(pe.focus, zz - TRACK.dark.wallZ, smoothstep(m.start, at(m, 0.2), t));
        return { pos: [x0 + x.at(t), lerp(pe.pos[1], TRACK.dark.eye, smoothstep(m.start, at(m, 0.4), t)), zz], yaw: 0, focus };
      },
    });
  }

  // Words: walk almost straight up to the LED wall in its recess (original 63–92 s).
  let wordsAnchor: TrackAnchors['words'] = null;
  if (words) {
    const w = words;
    const W = TRACK.words;
    const s0 = poseAt(w.start);
    const v0 = velBefore(w.start)[0];
    const zLed = s0.pos[2] - W.d[0][1];
    const dist = curve(W.d.map(([u, v]) => ({ t: at(w, u), v })));
    const drift = curve(W.drift.map(([u, v], i) => ({ t: at(w, u), v: i === 0 ? v0 : v * pace(w) })));
    const x = integral((t) => drift.at(t), w.start, w.end);
    // Without the hall (60 s cut) the right turn happens here, before the robot door.
    const turn = likes ? 0 : TRACK.hall.turn;
    regions.push({
      start: w.start,
      end: w.end,
      pose: (t) => {
        const d = dist.at(t);
        return {
          pos: [s0.pos[0] + x.at(t), lerp(s0.pos[1], TRACK.dark.eye, smoothstep(w.start, at(w, 0.1), t)), zLed + d],
          yaw: turn * smoothstep(at(w, 0.95), w.end, t),
          focus: lerp(s0.focus, d, smoothstep(w.start, at(w, 0.1), t)),
        };
      },
    });
    const right = s0.pos[0] + x.at(w.end) + W.rightMargin;
    const cx = right - W.ledWidth / 2;
    wordsAnchor = { center: [cx, W.ledY, zLed], width: W.ledWidth, height: W.ledHeight, recess: [cx - W.ledWidth / 2 - W.recessMargin, right + W.recessMargin] };
  }

  // The hall: turn right off the LED wall, orbit the thumb, truck along the Videos wall (original 92–122 s).
  let hall: HallAnchors | null = null;
  if (likes) {
    const l = likes;
    const H0 = TRACK.hall;
    const s0 = poseAt(l.start);
    const v0 = velBefore(l.start)[0];
    const tTurn = at(l, H0.turnEnd);
    const tOrbitEnd = videos ? at(videos, H0.orbitEndWithVideos) : at(l, H0.orbitEndWithoutVideos);
    regions.push({
      start: l.start,
      end: tTurn,
      pose: (t) => {
        const k = smoothstep(l.start, tTurn, t);
        return { pos: [s0.pos[0] + v0 * (t - l.start), s0.pos[1], s0.pos[2]], yaw: H0.turn * k, focus: lerp(s0.focus, H0.r0, k) };
      },
    });
    const p1 = poseAt(tTurn).pos;
    const thumb = add([p1[0], 0, p1[2]], scale(dirOf(H0.turn), H0.r0));
    const orbit = (t: number): WalkPose => {
      const e = smoothstep(tTurn, tOrbitEnd, t);
      const phi = H0.turn - H0.orbit * e;
      const r = lerp(H0.r0, H0.r1, e);
      const p = sub(thumb, scale(dirOf(phi), r));
      return { pos: [p[0], s0.pos[1], p[2]], yaw: phi + H0.lookOffset * e, focus: lerp(r, H0.videosWall, e) };
    };
    regions.push({ start: tTurn, end: tOrbitEnd, pose: orbit });
    const last = orbit(tOrbitEnd);
    const vy = last.yaw;
    const vT = TRACK.truck.videos * V;
    const truck = integral((t) => vT * smoothstep(tOrbitEnd, tOrbitEnd + TRACK.truck.ramp, t), tOrbitEnd, robots.start);
    regions.push({ start: tOrbitEnd, end: robots.start, pose: (t) => ({ pos: add(last.pos, scale(rightOf(vy), truck.at(t))), yaw: vy, focus: H0.videosWall }) });
    // Walls in a chain: Videos wall, the grid wall turned 50° at its right end, then the Likes wall.
    const videosOrigin = add([last.pos[0], 0, last.pos[2]], scale(dirOf(vy), H0.videosWall));
    const videosRight = add(videosOrigin, scale(rightOf(vy), H0.videosHalfWidth));
    const gy = vy + H0.gridTurn;
    const gridFar = add(videosRight, scale(rightOf(gy), H0.gridLength));
    const ly = vy + H0.likesTurn;
    hall = {
      thumb,
      turnYaw: H0.turn,
      orbitEnd: tOrbitEnd,
      videosWall: { origin: videosOrigin, yaw: vy },
      gridWall: { origin: add(videosRight, scale(rightOf(gy), H0.gridLength / 2)), yaw: gy },
      likesWall: { origin: add(gridFar, scale(rightOf(ly), H0.likesLength / 2)), yaw: ly },
    };
  }

  // Robot room: coast sideways to a stop, then go straight at the platform (original 122–150 s).
  const t0 = robots.start;
  const r0 = poseAt(t0);
  const v0 = velBefore(t0);
  const yawR = r0.yaw;
  const R = TRACK.robots;
  const robotsFrame: Frame = { origin: [r0.pos[0], 0, r0.pos[2]], yaw: yawR };
  const vLat = dot(v0, rightOf(yawR));
  const vFwd = dot(v0, dirOf(yawR));
  const tau = R.settle;
  const tA = at(robots, R.approachFrom);
  const platformZ = -(vFwd * tau + R.dStart);
  regions.push({
    start: t0,
    end: dive.start,
    pose: (t) => {
      const k = tau * (1 - Math.exp(-(t - t0) / tau));
      const a = Math.max(0, (t - tA) / (dive.start - tA));
      const local: Vec3 = [vLat * k, lerp(r0.pos[1], R.eye, smoothstep(t0, at(robots, R.eyeBlend), t)), -vFwd * k - (R.dStart - R.dEnd) * a * a];
      return { pos: toWorld(robotsFrame, local), yaw: yawR, focus: lerp(r0.focus, local[2] - platformZ, smoothstep(t0, at(robots, 0.1), t)) };
    },
  });

  // Wipes: what crosses the lens, and for how long the frame is (partly) covered.
  const wipes: Wipe[] = [];
  const addWipe = (name: Wipe['name'], mid: number, halfWidth: number, gap: number, speed: number) => {
    const half = (halfWidth + gap * HALF_HFOV_TAN) / Math.max(Math.abs(speed), 0.2) + 0.3;
    wipes.push({ name, mid, start: mid - half, end: mid + half });
  };
  let whiteBlock: TrackAnchors['whiteBlock'] = null;
  if (portraits && white.blockX0 !== null) {
    const tb = at(portraits, TRACK.whiteBlock.at);
    whiteBlock = { x0: white.blockX0, x1: white.blockX0 + TRACK.whiteBlock.width, depth: white.distanceAt(tb) - TRACK.whiteBlock.gap };
    addWipe('white-block', tb, TRACK.whiteBlock.width / 2, TRACK.whiteBlock.gap, V);
  }
  let darkPillar: Vec3 | null = null;
  const next = moments ?? words;
  if (next) {
    const tp = next.start + TRACK.darkPillar.after / pace(next);
    const p = poseAt(tp);
    darkPillar = [p.pos[0], 0, p.pos[2] - TRACK.darkPillar.gap];
    addWipe('dark-pillar', tp, TRACK.darkPillar.width / 2, TRACK.darkPillar.gap, velBefore(tp)[0]);
  }
  addWipe('robot-door', t0, TRACK.door.width / 2, TRACK.door.gap, vLat);

  // Smooth the piecewise walk: samples every 0.25 s plus every region edge, with their exact derivatives.
  const special = [white.tPar, white.tEx, white.tPullBack, dive.start, ...regions.flatMap((r) => [r.start, r.end])];
  const samples: number[] = [];
  for (let t = 0; t < dive.start; t += TRACK.sample) if (special.every((s) => Math.abs(s - t) > 1e-3)) samples.push(t);
  const ts = [...new Set([...samples, ...special])].filter((t) => t >= 0 && t <= dive.start).sort((a, b) => a - b);
  const h = 1e-4;
  const around = (f: (t: number) => Vec3, t: number): Vec3 => {
    const a = Math.max(0, t - h);
    const b = Math.min(dive.start, t + h);
    return scale(sub(f(b), f(a)), 1 / (b - a));
  };
  const posOf = (t: number): Vec3 => poseAt(t).pos;
  const targetOf = (t: number): Vec3 => {
    const p = poseAt(t);
    return add(p.pos, scale(dirOf(p.yaw), TRACK.look));
  };
  const pos = createSpline(ts.map((t) => ({ t, value: posOf(t), velocity: around(posOf, t) })));
  const target = createSpline(ts.map((t) => ({ t, value: targetOf(t), velocity: around(targetOf, t) })));
  const focus = curve(ts.map((t) => ({ t, v: poseAt(t).focus })));
  const exitPos = pos.at(dive.start);

  return {
    speed: V,
    tPar: white.tPar,
    tEx: white.tEx,
    pose: poseAt,
    pos,
    target,
    focus,
    exit: { pos: exitPos, vel: scale(sub(exitPos, pos.at(dive.start - 1e-3)), 1e3) },
    anchors: {
      tPullBack: white.tPullBack,
      whiteBlock,
      whiteWallEnd,
      dark: hasDark ? { wallZ: TRACK.dark.wallZ, x0: whiteWallEnd } : null,
      words: wordsAnchor,
      hall,
      darkPillar,
      door: { origin: add([r0.pos[0], 0, r0.pos[2]], scale(dirOf(yawR), TRACK.door.gap)), yaw: yawR },
      robots: robotsFrame,
      settle: vLat * tau,
      platformZ,
    },
    wipes,
    ledSwitches: words ? TRACK.words.switches.map((u) => at(words, u)) : [],
  };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/unit/track.test.ts && npx tsc --noEmit`
Expected: PASS (13 passed), type check clean.
- If a continuity bound fails in one cut, the message names the cut and the time. Fix the region formula at that seam, not the bound.

- [ ] **Step 5: Commit**

```bash
git add src/camera/track.ts tests/unit/track.test.ts
git commit -m "feat(v4): camera track measured from the original — regions, anchors, wipes"
```

---
### Task 4: Gallery layout from the track

**Files:**
- Create: `src/stage/gallery.ts`
- Modify: `src/stage/placement.ts`. `photoSwarm` gains a `rise` parameter. `networkLayout` spokes go to the 24 nearest nodes (review M1).
- Test: `tests/unit/gallery.test.ts`

**Interfaces:**
- Consumes: `TRACK`, `whiteWalk`, `computeTrack`, `Track` (Task 3); `Frame`, `IDENTITY`, `child`, `toWorld` (Task 2); `photoSwarm`, `pickSpread`, `shuffle`, `spot`, `networkLayout` (`placement.ts`).
- Produces:
  - Constants: `TEXT`, `WALL_HEIGHT`, `LABEL_Y`, `CARPET`, `ROBOTS`, `HALL`.
  - Types:
    - `type Region = 'walk' | 'robots' | 'both'`;
    - `WallQuad { name; frame; center: [x, y]; width; height; dark; region }` (a quad in the frame's local xy plane, facing +z);
    - `FloorQuad { name; frame; center: [x, z]; width; depth; dark; region }`;
    - `Block { name; frame; center: Vec3; size: Vec3; dark; region; until? }`;
    - `Obstacle { name; frame; min; max; region; until? }` (a box in frame-local coordinates);
    - `Label { text; number; frame; at: Vec3; dark }`, `WallText`, `Screen`;
    - `GridCell { col; row; center; width; height; photos: number[] }` (`photos[k]` is the photo shown during swap step k);
    - `Gallery`, `GalleryInput`.
  - Functions: `gallerySpeed(sequence): number` (throws if the texts never fit, review M7), and `computeGallery(input): Gallery`.
  - `Gallery` fields:
    - `speed`, `track`, `walls`, `floors`, `blocks`, `obstacles`, `labels`;
    - `wall: { title; exhibition; intro; blockText }`;
    - `portraits: { items; visitors } | null`, `photos: { items; visitors }`;
    - `location: { boxes; visitors } | null`, in the Location frame `{ origin: [0, 0, wallZ], yaw: 0 }`;
    - `words: { wall; visitors } | null`, in world coordinates;
    - `hall: { thumb: Frame; crts: { frame; screens }; grid: { frame; cells; step; start }; videos: { frame; photoIndex; panels; visitors }; visitors } | null`;
    - `robots: { frame; platform; arms; floaters }` and `finale: { frame; carpet; lifted; network; card }`, both in the robot frame;
    - `featured`, `portraitIndex`.

- [ ] **Step 1: Write the failing test `tests/unit/gallery.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TRACK } from '../../src/camera/track';
import { buildSequence, findSegment, requireSegment } from '../../src/plan/sequence';
import { toLocal, toWorld } from '../../src/stage/frame';
import { HALL, TEXT, computeGallery, gallerySpeed, type Gallery, type WallQuad } from '../../src/stage/gallery';
import { MIN_NETWORK_NODES } from '../../src/stage/placement';
import type { LengthMode, Vec3 } from '../../src/types';

const CUTS: { mode: LengthMode; music: number | null }[] = [
  { mode: 'auto', music: null }, { mode: 30, music: null }, { mode: 60, music: null }, { mode: 90, music: null }, { mode: 120, music: null },
  { mode: 'music', music: 46 }, { mode: 'music', music: 74 }, { mode: 'music', music: 104 }, { mode: 'music', music: 300 },
];

function make(n = 20, mode: LengthMode = 'auto', music: number | null = null) {
  const sequence = buildSequence({ photoCount: n, lengthMode: mode, musicDuration: music });
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  return { sequence, gallery: computeGallery({ sequence, aspects, portraitIndex: 1 % n, seed: 7 }) };
}

const ends = (w: WallQuad): [Vec3, Vec3] => [toWorld(w.frame, [w.center[0] - w.width / 2, 0, 0]), toWorld(w.frame, [w.center[0] + w.width / 2, 0, 0])];
const orient = (p: Vec3, q: Vec3, r: Vec3) => (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
const cross = ([a, b]: [Vec3, Vec3], [c, d]: [Vec3, Vec3]) => orient(c, d, a) * orient(c, d, b) < -1e-6 && orient(a, b, c) * orient(a, b, d) < -1e-6;
function distance(p: Vec3, [a, b]: [Vec3, Vec3]): number {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - u * dx, p[2] - a[2] - u * dz);
}
const insideObstacle = (g: Gallery, p: Vec3, t: number, region: 'walk' | 'robots') =>
  g.obstacles
    .filter((o) => (o.region === region || o.region === 'both') && (o.until === undefined || t < o.until))
    .find((o) => toLocal(o.frame, p).every((v, i) => v > o.min[i] && v < o.max[i]));

describe('computeGallery', () => {
  it('walks at the measured 0.95 m/s in the auto cut, faster in the fixed cuts, with the wall texts apart', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      expect(gallery.speed).toBe(gallerySpeed(sequence));
      if (c.mode === 'auto') expect(gallery.speed).toBe(TRACK.speed);
      const { title, exhibition, intro } = gallery.wall;
      expect(title.center[0] + TEXT.titleWidth / 2 + TEXT.gap).toBeLessThanOrEqual(exhibition.center[0] - TEXT.exhibitionWidth / 2 + 1e-9);
      if (intro) {
        expect(intro.avatar.center[0] - intro.avatar.width / 2).toBeGreaterThanOrEqual(exhibition.center[0] + TEXT.exhibitionWidth / 2 + TEXT.gap - 1e-9);
        const block = gallery.track.anchors.whiteBlock;
        if (block) expect(intro.center[0] + intro.width / 2 + TEXT.endMargin).toBeLessThanOrEqual(block.x0 + 1e-9);
      }
    }
  });

  it('centres the exhibition text on the camera at t_ex', () => {
    const { gallery } = make();
    expect(gallery.wall.exhibition.center[0]).toBeCloseTo(gallery.track.pose(gallery.track.tEx).pos[0], 9);
  });

  it('hangs Friends and Photos on one white wall with nothing between them', () => {
    const { gallery } = make();
    const whiteBlocks = gallery.blocks.filter((b) => b.name === 'white-block');
    expect(whiteBlocks).toHaveLength(1);
    const blockRight = whiteBlocks[0].center[0] + whiteBlocks[0].size[0] / 2;
    const items = [...gallery.portraits!.items, ...gallery.photos.items];
    for (const i of items) expect(i.center[2]).toBe(0);
    const xs = items.map((i) => i.center[0]);
    expect(Math.min(...xs)).toBeGreaterThan(blockRight);
    const between = gallery.blocks.filter((b) => {
      const c = toWorld(b.frame, b.center);
      return c[0] > blockRight && c[0] < Math.max(...xs) && c[2] < 5;
    });
    expect(between).toEqual([]);
    expect(gallery.track.wipes.map((w) => w.name)).toEqual(['white-block', 'dark-pillar', 'robot-door']);
  });

  it('walls never cross, in every cut', () => {
    for (const c of CUTS) {
      const { gallery } = make(20, c.mode, c.music);
      for (const region of ['walk', 'robots'] as const) {
        const walls = gallery.walls.filter((w) => w.region === region);
        for (let i = 0; i < walls.length; i++) {
          for (let j = i + 1; j < walls.length; j++) expect(cross(ends(walls[i]), ends(walls[j])), `${c.mode}/${c.music}: ${walls[i].name} × ${walls[j].name}`).toBe(false);
        }
      }
    }
  });

  it('the camera keeps 1 m from every wall and never enters an obstacle before the dive, in every cut', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      const robots = requireSegment(sequence, 'robots');
      const dive = requireSegment(sequence, 'dive');
      for (let t = 0; t < dive.start; t += 0.25) {
        const p = gallery.track.pos.at(t);
        const region = t < robots.start ? 'walk' : 'robots';
        for (const w of gallery.walls.filter((x) => x.region === region)) {
          expect(distance(p, ends(w)), `${c.mode}/${c.music}: ${w.name} at t=${t}`).toBeGreaterThan(1);
        }
        expect(insideObstacle(gallery, p, t, region)?.name, `${c.mode}/${c.music}: t=${t}`).toBeUndefined();
      }
    }
  });

  it('three photos still fill every room with valid photos', () => {
    const { gallery } = make(3);
    expect(gallery.location!.boxes).toHaveLength(3);
    expect(gallery.portraits!.items.length).toBeGreaterThan(0);
    const hall = gallery.hall!;
    for (const cell of hall.grid.cells) for (const p of cell.photos) expect(p).toBeLessThan(3);
    for (const s of hall.crts.screens) expect(s.photoIndex).toBeLessThan(3);
    expect(gallery.finale.network.nodes).toHaveLength(MIN_NETWORK_NODES);
    expect(new Set(gallery.featured).size).toBe(gallery.featured.length);
    for (const f of gallery.featured) expect(f).toBeLessThan(3);
  });

  it('500 photos keep every index valid', () => {
    const { gallery } = make(500);
    expect(gallery.photos.items).toHaveLength(500);
    const all = [...gallery.photos.items.map((i) => i.photoIndex), ...gallery.robots.floaters.map((f) => f.photoIndex), ...gallery.hall!.grid.cells.flatMap((c) => c.photos)];
    for (const i of all) expect(i >= 0 && i < 500).toBe(true);
  });

  it('the grid swaps at most two cells per step and its table covers the whole hall', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      if (!gallery.hall) continue;
      const { cells, step, start } = gallery.hall.grid;
      expect(cells).toHaveLength(HALL.grid.cols * HALL.grid.rows);
      const steps = cells[0].photos.length;
      expect(start + (steps - 1) * step).toBeGreaterThanOrEqual(requireSegment(sequence, 'robots').start - step);
      for (let k = 1; k < steps; k++) expect(cells.filter((cell) => cell.photos[k] !== cell.photos[k - 1]).length).toBeLessThanOrEqual(2);
    }
  });

  it('numbers the labels like the original and renumbers shorter cuts', () => {
    const names = (g: Gallery) => g.labels.map((l) => `${l.text} ${l.number}`);
    expect(names(make().gallery)).toEqual(['Friends 1', 'Photos 2', 'Location 3', 'Words 4', 'Likes 5.1', 'Photos 5.2', 'Videos 5.3']);
    expect(names(make(20, 60).gallery)).toEqual(['Friends 1', 'Photos 2', 'Words 3']);
    expect(names(make(20, 30).gallery)).toEqual(['Photos 1']);
  });

  it('puts the robot room and the finale in the robot frame, the platform straight ahead', () => {
    for (const c of CUTS) {
      const { sequence, gallery } = make(20, c.mode, c.music);
      expect(gallery.finale.frame).toBe(gallery.robots.frame);
      expect(gallery.robots.platform.center[2]).toBeCloseTo(gallery.track.anchors.platformZ, 12);
      const dive = requireSegment(sequence, 'dive');
      const cam = toLocal(gallery.robots.frame, gallery.track.pos.at(dive.start));
      expect(cam[2]).toBeGreaterThan(gallery.robots.platform.center[2] + ROBOTS_CLEARANCE);
      expect(Math.abs(cam[0] - gallery.robots.platform.center[0])).toBeLessThan(0.5);
    }
  });

  it('network spokes reach nodes below and above the core', () => {
    const { gallery } = make();
    const net = gallery.finale.network;
    const spokes = net.edges.filter(([a]) => a === -1).map(([, b]) => net.nodes[b].pos[1]);
    expect(spokes.some((y) => y > 0)).toBe(true);
    expect(spokes.some((y) => y < 0)).toBe(true);
  });

  it('is deterministic', () => {
    const a = make(20);
    const b = make(20);
    const strip = (g: Gallery) => JSON.stringify({ ...g, track: null });
    expect(strip(a.gallery)).toBe(strip(b.gallery));
    expect(findSegment(a.sequence, 'likes')).not.toBeNull();
  });
});

const ROBOTS_CLEARANCE = 5;
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/gallery.test.ts`
Expected: FAIL (cannot find module `../../src/stage/gallery`).

- [ ] **Step 3: Modify `src/stage/placement.ts`**

Change the `photoSwarm` signature so it takes a `rise` for the stack's centre line, lower left → upper right:
```ts
export function photoSwarm(aspects: number[], xa: number, xb: number, rnd: () => number, wallHeight = 6, z = 0, rise: readonly [number, number] = [1.25, 3.4]): CanvasItem[] {
```
In the body, replace `const centerY = lerp(1.25, 3.4, u ** 0.8);` with:
```ts
    const centerY = lerp(rise[0], rise[1], u ** 0.8);
```

In `networkLayout`, replace
```ts
  for (let i = 0; i < Math.min(24, nodes.length); i++) add(-1, i);
```
with
```ts
  // The core links to its 24 nearest nodes, all around it (review M1: indices 0–23 are the Fibonacci top cap).
  nodes
    .map((node, i) => ({ i, d: Math.hypot(node.pos[0], node.pos[1], node.pos[2]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 24)
    .forEach(({ i }) => add(-1, i));
```

- [ ] **Step 4: Write `src/stage/gallery.ts`**

```ts
import { TRACK, computeTrack, whiteWalk, type Track, type WhiteWalk } from '../camera/track';
import { findSegment, requireSegment } from '../plan/sequence';
import type { Segment, Sequence, Vec3 } from '../types';
import { clamp, lerp } from '../util/math';
import { mulberry32 } from '../util/rng';
import { IDENTITY, child, toWorld, type Frame } from './frame';
import { networkLayout, photoSwarm, pickSpread, shuffle, spot, type CanvasItem, type NetworkLayout, type VisitorSpot } from './placement';

/** White-wall lettering, sized for the measured distances (spec v4 §1; tuned in Task 11). */
export const TEXT = {
  titleWidth: 4.4, titleHeight: 1.2, titleY: 1.35,
  exhibitionWidth: 5.6, exhibitionHeight: 1.6, exhibitionY: 1.2,
  introTextWidth: 5.4, introHeight: 1.1, introY: 1.35, avatar: 0.62,
  gap: 0.8, endMargin: 1,
} as const;
export const WALL_HEIGHT = { white: 7, dark: 6, robots: 10 } as const;
export const LABEL_Y = 1.75;
export const CARPET = { cols: 64, rows: 36, pitch: 0.15, tile: 0.14 } as const;
export const ROBOTS = { platform: { width: 10, depth: 6, height: 0.35 }, back: 8, halfWidth: 16, front: 6, liftY: 3, floaters: 280 } as const;
export const HALL = {
  crt: { count: 7, from: -2.2, pitch: 1.0, y: 1.35, z: 1.6, width: 0.46, height: 0.34 },
  grid: { cols: 6, rows: 5, pitchX: 0.7, pitchY: 0.52, width: 0.62, height: 0.46, bottom: 1.0, step: 1.6 },
  videos: { cols: 4, rows: 3, width: 2, height: 1.2, gap: 0.06, y: 2.2 },
} as const;

export type Region = 'walk' | 'robots' | 'both';

/** A wall in its frame's local xy plane (z = 0), facing local +z. */
export interface WallQuad {
  name: string;
  frame: Frame;
  center: [number, number];
  width: number;
  height: number;
  dark: boolean;
  region: Region;
}

export interface FloorQuad {
  name: string;
  frame: Frame;
  center: [number, number];
  width: number;
  depth: number;
  dark: boolean;
  region: Region;
}

export interface Block {
  name: string;
  frame: Frame;
  center: Vec3;
  size: Vec3;
  dark: boolean;
  region: Region;
  /** Removed from the scene after this time (the robot door, once it has left the frame). */
  until?: number;
}

export interface Obstacle {
  name: string;
  frame: Frame;
  min: Vec3;
  max: Vec3;
  region: Region;
  until?: number;
}

export interface Label {
  text: string;
  number: string;
  frame: Frame;
  at: Vec3;
  dark: boolean;
}

export interface WallText {
  center: Vec3;
  width: number;
  height: number;
}

export interface Screen {
  center: Vec3;
  width: number;
  height: number;
  bars: boolean;
  photoIndex: number;
}

export interface GridCell {
  col: number;
  row: number;
  center: Vec3;
  width: number;
  height: number;
  /** Photo shown during swap step k. */
  photos: number[];
}

export interface Gallery {
  speed: number;
  track: Track;
  walls: WallQuad[];
  floors: FloorQuad[];
  blocks: Block[];
  obstacles: Obstacle[];
  labels: Label[];
  wall: {
    title: WallText;
    exhibition: WallText;
    intro: (WallText & { avatar: CanvasItem }) | null;
    blockText: { frame: Frame; center: Vec3; width: number; height: number } | null;
  };
  portraits: { items: CanvasItem[]; visitors: VisitorSpot[] } | null;
  photos: { items: CanvasItem[]; visitors: VisitorSpot[] };
  /** In the Location frame { origin: [0, 0, wallZ], yaw: 0 }. */
  location: { frame: Frame; boxes: CanvasItem[]; visitors: VisitorSpot[] } | null;
  words: { wall: WallText; visitors: VisitorSpot[] } | null;
  hall: {
    thumb: Frame;
    crts: { frame: Frame; screens: Screen[] };
    grid: { frame: Frame; cells: GridCell[]; step: number; start: number };
    videos: { frame: Frame; photoIndex: number; panels: { col: number; row: number; center: Vec3; width: number; height: number }[]; visitors: VisitorSpot[] };
    visitors: VisitorSpot[];
  } | null;
  robots: {
    frame: Frame;
    platform: { center: Vec3; width: number; depth: number; height: number };
    arms: { pos: Vec3; yaw: number; phase: number }[];
    floaters: { photoIndex: number; pos: Vec3; size: number; phase: number }[];
  };
  finale: { frame: Frame; carpet: Vec3; lifted: Vec3; network: NetworkLayout; card: Vec3 };
  featured: number[];
  portraitIndex: number;
}

export interface GalleryInput {
  sequence: Sequence;
  aspects: number[];
  portraitIndex: number;
  seed: number;
}

type WallTexts = Omit<Gallery['wall'], 'blockText'>;

function wallTexts(white: WhiteWalk): { wall: WallTexts; fits: boolean } {
  const focusX = (t: number) => white.xAt(t) + white.distanceAt(t) * Math.tan(white.yawAt(t));
  const title: WallText = { center: [focusX(white.tTitle) + 0.4, TEXT.titleY, 0], width: TEXT.titleWidth, height: TEXT.titleHeight };
  const exX = white.xAt(white.tEx);
  const exhibition: WallText = { center: [exX, TEXT.exhibitionY, 0], width: TEXT.exhibitionWidth, height: TEXT.exhibitionHeight };
  const exRight = exX + TEXT.exhibitionWidth / 2;
  // The intro ends before the white block; without Friends, the texts end before the Photos label.
  const limit = white.blockX0 ?? white.xAt(white.photosStart) + 1.5;
  let intro: WallTexts['intro'] = null;
  let lastRight = exRight;
  if (white.tIntro !== null) {
    const blockW = TEXT.avatar + 0.2 + TEXT.introTextWidth;
    const latest = limit - TEXT.endMargin - blockW / 2;
    const c = Math.max(Math.min(white.xAt(white.tIntro), latest), exRight + TEXT.gap + blockW / 2);
    const left = c - blockW / 2;
    intro = {
      center: [left + TEXT.avatar + 0.2 + TEXT.introTextWidth / 2, TEXT.introY, 0],
      width: TEXT.introTextWidth,
      height: TEXT.introHeight,
      avatar: { photoIndex: -1, center: [left + TEXT.avatar / 2, TEXT.introY, 0], width: TEXT.avatar, height: TEXT.avatar },
    };
    lastRight = left + blockW;
  }
  const fits = title.center[0] + TEXT.titleWidth / 2 + TEXT.gap <= exhibition.center[0] - TEXT.exhibitionWidth / 2 && lastRight + TEXT.endMargin <= limit;
  return { wall: { title, exhibition, intro }, fits };
}

/** The slowest speed (from the measured 0.95 m/s up) at which the white-wall texts fit. */
export function gallerySpeed(sequence: Sequence): number {
  let V: number = TRACK.speed;
  for (let i = 0; i < 200; i++) {
    if (wallTexts(whiteWalk(sequence, V)).fits) return V;
    V *= 1.02;
  }
  throw new Error('the white-wall texts do not fit at any walking speed');
}

const at = (s: Segment, u: number) => s.start + u * (s.end - s.start);

export function computeGallery(input: GalleryInput): Gallery {
  const { sequence, aspects } = input;
  const n = aspects.length;
  if (n === 0) throw new Error('the gallery needs at least one photo');
  const portraitIndex = clamp(Math.round(input.portraitIndex), 0, n - 1);
  const rnd = mulberry32(input.seed);
  const V = gallerySpeed(sequence);
  const white = whiteWalk(sequence, V);
  const track = computeTrack(sequence, V);
  const A = track.anchors;
  const texts = wallTexts(white).wall;
  if (texts.intro) texts.intro.avatar.photoIndex = portraitIndex;
  const photosSeg = requireSegment(sequence, 'photos');
  const portraitsSeg = findSegment(sequence, 'portraits');
  const moments = findSegment(sequence, 'moments');
  const words = findSegment(sequence, 'words');
  const likes = findSegment(sequence, 'likes');
  const robotsSeg = requireSegment(sequence, 'robots');
  const xAt = (t: number) => track.pose(t).pos[0];

  const walls: WallQuad[] = [];
  const floors: FloorQuad[] = [];
  const blocks: Block[] = [];
  const obstacles: Obstacle[] = [];
  const labels: Label[] = [];
  let section = 0;

  // White wall (z = 0) and its floor.
  const wallEnd = A.whiteWallEnd;
  walls.push({ name: 'white-wall', frame: IDENTITY, center: [(wallEnd - 12) / 2, WALL_HEIGHT.white / 2], width: wallEnd + 12, height: WALL_HEIGHT.white, dark: false, region: 'walk' });
  floors.push({ name: 'white-floor', frame: IDENTITY, center: [(wallEnd - 15) / 2, 10], width: wallEnd + 15, depth: 20, dark: false, region: 'walk' });

  let blockText: Gallery['wall']['blockText'] = null;
  if (A.whiteBlock) {
    const b = A.whiteBlock;
    blocks.push({ name: 'white-block', frame: IDENTITY, center: [(b.x0 + b.x1) / 2, WALL_HEIGHT.white / 2, b.depth / 2], size: [b.x1 - b.x0, WALL_HEIGHT.white, b.depth], dark: false, region: 'walk' });
    // A column of text on the block's side facing the Friends room (original 26 s).
    blockText = { frame: { origin: [b.x1 + 0.005, 0, 0], yaw: -Math.PI / 2 }, center: [-b.depth * 0.55, 1.45, 0], width: 1.5, height: 1.3 };
  }

  let portraits: Gallery['portraits'] = null;
  const photosLabelX = xAt(photosSeg.start) + 1.7;
  if (portraitsSeg && A.whiteBlock) {
    const labelX = A.whiteBlock.x1 + 2.0;
    labels.push({ text: 'Friends', number: String(++section), frame: IDENTITY, at: [labelX, LABEL_Y, 0.01], dark: false });
    const xa = labelX + 1.6;
    const xb = photosLabelX - 1.4;
    const k = Math.min(12, n, Math.max(1, Math.floor((xb - xa) / 1.7) + 1));
    const indices = pickSpread(n, k);
    portraits = {
      items: indices.map((photoIndex, i) => ({ photoIndex, center: [k === 1 ? (xa + xb) / 2 : lerp(xa, xb, i / (k - 1)), 1.85, 0], width: 1.15, height: 1.15 })),
      visitors: [spot([xAt(at(portraitsSeg, 0.62)) + 0.6, 0, 1.2], 0, rnd), spot([xAt(at(portraitsSeg, 0.8)) + 1.8, 0, 1.0], 1, rnd)],
    };
  }

  labels.push({ text: 'Photos', number: String(++section), frame: IDENTITY, at: [photosLabelX, LABEL_Y, 0.01], dark: false });
  const swarmA = photosLabelX + 1.2;
  const swarmB = Math.max(swarmA + 4, wallEnd - 0.8);
  const passer = track.pose(at(photosSeg, 0.55)).pos;
  const photos: Gallery['photos'] = {
    items: photoSwarm(aspects, swarmA, swarmB, rnd, WALL_HEIGHT.white, 0, [1.3, 4.6]),
    visitors: [
      spot([lerp(swarmA, swarmB, 0.25), 0, 1.2], 0, rnd),
      spot([lerp(swarmA, swarmB, 0.55), 0, 1.6], 2, rnd),
      spot([lerp(swarmA, swarmB, 0.8), 0, 2.4], 1, rnd),
      // Passes right in front of the lens during the pull-back (original 46 s).
      spot([passer[0] - 0.5, 0, passer[2] - 1.4], 0, rnd),
    ],
  };

  // Dark rooms: the shallow Location wall and the Words recess (original 53–92 s).
  let location: Gallery['location'] = null;
  let wordsRoom: Gallery['words'] = null;
  if (A.dark) {
    const D = A.dark;
    const recess = A.words?.recess ?? ([D.x0 + 14, D.x0 + 14] as [number, number]);
    const front: Frame = { origin: [0, 0, D.wallZ], yaw: 0 };
    walls.push({ name: 'white-end', frame: { origin: [D.x0, 0, 0], yaw: Math.PI / 2 }, center: [D.wallZ / 2, WALL_HEIGHT.white / 2], width: D.wallZ, height: WALL_HEIGHT.white, dark: false, region: 'walk' });
    walls.push({ name: 'location-wall', frame: front, center: [(D.x0 + recess[0]) / 2, WALL_HEIGHT.dark / 2], width: recess[0] - D.x0, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    floors.push({ name: 'dark-floor', frame: IDENTITY, center: [D.x0 + 60, -20], width: 120, depth: 80, dark: true, region: 'walk' });
    if (moments) {
      labels.push({ text: 'Location', number: String(++section), frame: front, at: [D.x0 + 1.5, LABEL_Y, 0.01], dark: true });
      const indices = n >= 3 ? pickSpread(n, 3, 0.37) : [0, 1, 2].map((i) => i % n);
      const lo = D.x0 + 2.2;
      const hi = recess[0] - 1.6;
      const spacing = Math.min(2.6, Math.max(0, (hi - lo) / 2));
      const mid = clamp(xAt(at(moments, 0.7)) + 0.25, lo + spacing, Math.max(lo + spacing, hi - spacing));
      const cx = xAt(at(moments, 0.7));
      location = {
        frame: front,
        boxes: indices.map((photoIndex, i) => ({ photoIndex, center: [mid + (i - 1) * spacing, 1.65, 0], width: 1.5, height: 2.5 })),
        visitors: [spot([cx - 1.2, 0, 1.3], 2, rnd, true), spot([cx + 3.6, 0, 1.6], 0, rnd, true)],
      };
    }
    if (words && A.words) {
      const W = A.words;
      const zLed = W.center[2];
      labels.push({ text: 'Words', number: String(++section), frame: front, at: [recess[0] - 1.2, LABEL_Y, 0.01], dark: true });
      walls.push({ name: 'recess-left', frame: { origin: [recess[0], 0, D.wallZ], yaw: -Math.PI / 2 }, center: [(D.wallZ - zLed) / 2, WALL_HEIGHT.dark / 2], width: D.wallZ - zLed, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
      walls.push({ name: 'led-back', frame: { origin: [0, 0, zLed], yaw: 0 }, center: [(recess[0] + recess[1]) / 2, WALL_HEIGHT.dark / 2], width: recess[1] - recess[0], height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
      if (!likes) walls.push({ name: 'recess-right', frame: { origin: [recess[1], 0, zLed], yaw: Math.PI / 2 }, center: [(D.wallZ - zLed) / 2, WALL_HEIGHT.dark / 2], width: D.wallZ - zLed, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
      wordsRoom = {
        wall: { center: [W.center[0], W.center[1], zLed + 0.02], width: W.width, height: W.height },
        visitors: [spot([W.center[0] - 2.5, 0, zLed + 1.8], 0, rnd, true), spot([W.center[0] + 1.5, 0, zLed + 2.2], 1, rnd, true)],
      };
    }
  }
  if (A.darkPillar) {
    blocks.push({ name: 'dark-pillar', frame: IDENTITY, center: [A.darkPillar[0], 5, A.darkPillar[2]], size: [TRACK.darkPillar.width, 10, 0.5], dark: true, region: 'walk' });
  }

  // The hall: Likes 5.1, Photos 5.2 and Videos 5.3 around the thumb (original 92–122 s).
  let hall: Gallery['hall'] = null;
  if (likes && A.hall) {
    const Hh = A.hall;
    const no = ++section;
    const H = TRACK.hall;
    const thumb: Frame = { origin: Hh.thumb, yaw: Hh.turnYaw };
    obstacles.push({ name: 'sculpture', frame: thumb, min: [-1.9, 0, -1.9], max: [1.9, 4, 1.9], region: 'walk' });
    walls.push({ name: 'likes-wall', frame: Hh.likesWall, center: [0, WALL_HEIGHT.dark / 2], width: H.likesLength, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    walls.push({ name: 'grid-wall', frame: Hh.gridWall, center: [0, WALL_HEIGHT.dark / 2], width: H.gridLength, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });
    walls.push({ name: 'videos-wall', frame: Hh.videosWall, center: [0, WALL_HEIGHT.dark / 2], width: 2 * H.videosHalfWidth, height: WALL_HEIGHT.dark, dark: true, region: 'walk' });

    const C = HALL.crt;
    const screens: Screen[] = Array.from({ length: C.count }, (_, i) => ({ center: [C.from + i * C.pitch, C.y, C.z], width: C.width, height: C.height, bars: i % 3 === 1, photoIndex: (i * 5 + 2) % n }));
    obstacles.push({ name: 'crt-row', frame: Hh.likesWall, min: [C.from - 0.5, 0, C.z - 0.4], max: [C.from + (C.count - 1) * C.pitch + 0.5, 1.9, C.z + 0.4], region: 'walk' });
    labels.push({ text: 'Likes', number: `${no}.1`, frame: Hh.likesWall, at: [C.from + C.count * C.pitch + 0.6, LABEL_Y, 0.01], dark: true });

    const G = HALL.grid;
    const steps = Math.ceil((robotsSeg.start - likes.start) / G.step) + 1;
    const pool = shuffle(n, rnd);
    const cells: GridCell[] = [];
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        cells.push({ col: c, row: r, center: [(c - (G.cols - 1) / 2) * G.pitchX, G.bottom + (G.rows - 1 - r) * G.pitchY, 0.02], width: G.width, height: G.height, photos: [pool[(r * G.cols + c) % n]] });
      }
    }
    let next = cells.length;
    for (let k = 1; k < steps; k++) {
      // One or two photos change at each step, as on the original's grid wall.
      const changed = new Set([(k * 7 + 3) % cells.length, ...(k % 2 === 0 ? [(k * 11 + 5) % cells.length] : [])]);
      cells.forEach((cell, i) => cell.photos.push(changed.has(i) ? pool[next++ % n] : cell.photos[k - 1]));
    }
    labels.push({ text: 'Photos', number: `${no}.2`, frame: Hh.gridWall, at: [(G.cols * G.pitchX) / 2 + 0.7, LABEL_Y, 0.01], dark: true });

    const Vd = HALL.videos;
    const panels: NonNullable<Gallery['hall']>['videos']['panels'] = [];
    for (let row = 0; row < Vd.rows; row++) {
      for (let col = 0; col < Vd.cols; col++) {
        panels.push({ col, row, center: [(col - (Vd.cols - 1) / 2) * (Vd.width + Vd.gap), Vd.y + ((Vd.rows - 1) / 2 - row) * (Vd.height + Vd.gap), 0.02], width: Vd.width, height: Vd.height });
      }
    }
    labels.push({ text: 'Videos', number: `${no}.3`, frame: Hh.videosWall, at: [H.videosHalfWidth - 0.45, LABEL_Y, 0.01], dark: true });
    hall = {
      thumb,
      crts: { frame: Hh.likesWall, screens },
      grid: { frame: Hh.gridWall, cells, step: G.step, start: likes.start },
      videos: { frame: Hh.videosWall, photoIndex: pickSpread(n, 1, 0.61)[0], panels, visitors: [spot([-1.2, 0, 1.8], 0, rnd, true), spot([0.3, 0, 1.6], 2, rnd, true)] },
      visitors: [spot(toWorld(thumb, [-1.5, 0, 2.6]), 1, rnd, true, Math.PI - Hh.turnYaw)],
    };
  }

  // Robot room and finale, in the robot frame (straight ahead of the camera at the swap).
  const F2 = A.robots;
  const P = ROBOTS.platform;
  const px = A.settle;
  const pz = A.platformZ;
  const zBack = pz - ROBOTS.back;
  const depth = ROBOTS.front - zBack;
  walls.push({ name: 'robots-back', frame: child(F2, [0, 0, zBack]), center: [px, WALL_HEIGHT.robots / 2], width: 2 * ROBOTS.halfWidth, height: WALL_HEIGHT.robots, dark: false, region: 'robots' });
  walls.push({ name: 'robots-left', frame: child(F2, [px - ROBOTS.halfWidth, 0, zBack], -Math.PI / 2), center: [-depth / 2, WALL_HEIGHT.robots / 2], width: depth, height: WALL_HEIGHT.robots, dark: false, region: 'robots' });
  walls.push({ name: 'robots-right', frame: child(F2, [px + ROBOTS.halfWidth, 0, zBack], Math.PI / 2), center: [depth / 2, WALL_HEIGHT.robots / 2], width: depth, height: WALL_HEIGHT.robots, dark: false, region: 'robots' });
  floors.push({ name: 'robots-floor', frame: F2, center: [px, (zBack + ROBOTS.front) / 2], width: 2 * ROBOTS.halfWidth, depth, dark: false, region: 'robots' });
  const door = track.wipes.find((w) => w.name === 'robot-door')!;
  blocks.push({ name: 'robot-door', frame: A.door, center: [0, 5, 0], size: [TRACK.door.width, 10, 0.4], dark: true, region: 'both', until: door.end });

  const platformCenter: Vec3 = [px, P.height / 2, pz];
  // The last arm stands left of the dive so the camera brushes past it (original 152 s).
  const armSpots = [[-6.2, 0.6, 0], [6.2, 0.2, 1.7], [-3.6, -4.2, 3.1], [3.6, -4.0, 4.6], [-1.9, 5.4, 2.3]] as const;
  const arms = armSpots.map(([dx, dz, phase]) => ({ pos: [px + dx, 0, pz + dz] as Vec3, yaw: Math.atan2(-dx, -dz), phase }));
  for (const arm of arms) {
    const reach: Vec3 = [arm.pos[0] + Math.sin(arm.yaw) * 2.4, 0, arm.pos[2] + Math.cos(arm.yaw) * 2.4];
    obstacles.push({
      name: 'arm',
      frame: F2,
      min: [Math.min(arm.pos[0], reach[0]) - 0.7, 0, Math.min(arm.pos[2], reach[2]) - 0.7],
      max: [Math.max(arm.pos[0], reach[0]) + 0.7, 3.1, Math.max(arm.pos[2], reach[2]) + 0.7],
      region: 'robots',
    });
  }
  obstacles.push({ name: 'platform', frame: F2, min: [px - P.width / 2, 0, pz - P.depth / 2], max: [px + P.width / 2, P.height, pz + P.depth / 2], region: 'robots' });
  for (const b of blocks) {
    obstacles.push({ name: b.name, frame: b.frame, min: [b.center[0] - b.size[0] / 2, b.center[1] - b.size[1] / 2, b.center[2] - b.size[2] / 2], max: [b.center[0] + b.size[0] / 2, b.center[1] + b.size[1] / 2, b.center[2] + b.size[2] / 2], region: b.region, ...(b.until === undefined ? {} : { until: b.until }) });
  }
  const floaters = Array.from({ length: ROBOTS.floaters }, () => ({
    photoIndex: Math.floor(rnd() * n),
    pos: [px + lerp(-12, 12, rnd()), lerp(1.2, 5.5, rnd()), lerp(zBack + 0.5, zBack + 6, rnd())] as Vec3,
    size: lerp(0.16, 0.34, rnd()),
    phase: rnd() * Math.PI * 2,
  }));

  const carpet: Vec3 = [px, P.height + 0.006, pz];
  const featured = [
    ...new Set([
      portraitIndex,
      ...(portraits?.items.map((i) => i.photoIndex) ?? []),
      ...(location?.boxes.map((b) => b.photoIndex) ?? []),
      ...(hall ? [hall.videos.photoIndex] : []),
    ]),
  ];

  return {
    speed: V,
    track,
    walls,
    floors,
    blocks,
    obstacles,
    labels,
    wall: { ...texts, blockText },
    portraits,
    photos,
    location,
    words: wordsRoom,
    hall,
    robots: { frame: F2, platform: { center: platformCenter, width: P.width, depth: P.depth, height: P.height }, arms, floaters },
    finale: { frame: F2, carpet, lifted: [px, ROBOTS.liftY, pz], network: networkLayout(n, portraitIndex, rnd), card: [px, -200, pz] },
    featured,
    portraitIndex,
  };
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run tests/unit/gallery.test.ts && npx vitest run && npx tsc --noEmit`
Expected: gallery 12 passed, and the whole suite still passes (the v3 strip tests are unaffected by the placement change).
- If the clearance or crossing test fails, its message names the cut, the wall and the time. Move that wall through its `TRACK`/`HALL` constant and rule it in the ledger. Do not loosen the 1 m bound.

- [ ] **Step 6: Commit**

```bash
git add src/stage/gallery.ts src/stage/placement.ts tests/unit/gallery.test.ts
git commit -m "feat(v4): gallery layout from the measured track — walls, wipes, hall chain, robot frame"
```

---
### Task 5: Shell, labels and the white rooms

**Files:**
- Create:
  - `src/stage/gallery/context.ts`, `src/stage/gallery/common.ts`, `src/stage/gallery/shell.ts`;
  - `src/stage/gallery/rooms/wall.ts`, `src/stage/gallery/rooms/portraits.ts`, `src/stage/gallery/rooms/photos.ts`;
  - `tests/unit/fake-gallery.ts`.
- Test: `tests/unit/gallery-shell.test.ts`

**Interfaces:**
- Consumes: `Gallery`, `Label`, `Region`, `CARPET`, `computeGallery` (Task 4); `placeIn`, `toWorld` (Task 2); v3 parts (`createTextPlane`, `createCanvasBlock`, `BLOCK_DEPTH`, `buildAtlasInstances`, `createVisitor`, `createStageMaterials`).
- Produces:
  - `interface GalleryContent { library; name; subtitle; stamp; dateLabel; captions; led: { small; large; full; highlight: Texture }; mosaic: { colors; assignment } }`.
  - `interface GalleryContext { sequence; gallery; content; tex; mats }`, `interface RoomObject { group; update?; dispose? }`, `hiresOf(content, i)`.
  - `INK`, `LABEL_SIZE`, `createLabel(tex, label, mats): Group` (named `label:<text>`, placed in its frame), `buildLabels(ctx): Group`, `addVisitors(group, spots, mats)`.
  - `buildGalleryShell(ctx): { walk: Group; robots: Group; both: Group; timed: { object: Object3D; until: number }[] }`. Each wall, floor and block is a mesh named after it, inside a holder placed in its frame.
  - `buildWallRoom(ctx)`, `buildPortraitsRoom(ctx)` (null without Friends), `buildPhotosRoom(ctx)`.
  - `fakeTextures(aspect?)`, `fakeGalleryContext(n?, lengthMode?, opts?: { textAspect?: number; hires?: boolean; music?: number })`.

- [ ] **Step 1: Write the test context `tests/unit/fake-gallery.ts`**

```ts
import { Texture } from 'three';
import type { StageTextureFactory } from '../../src/assets/texture-factory';
import { buildSequence } from '../../src/plan/sequence';
import { CARPET, computeGallery } from '../../src/stage/gallery';
import type { GalleryContent, GalleryContext } from '../../src/stage/gallery/context';
import { createStageMaterials } from '../../src/stage/parts/materials';
import type { LengthMode } from '../../src/types';
import { fakeLibrary } from './fake-library';

export function fakeTextures(aspect = 4): StageTextureFactory {
  return {
    text: () => ({ texture: new Texture(), aspect }),
    glow: () => new Texture(),
    lightbox: () => new Texture(),
    colorBars: () => new Texture(),
    concrete: () => new Texture(),
  };
}

export function fakeGalleryContext(n = 12, lengthMode: LengthMode = 'auto', opts: { textAspect?: number; hires?: boolean; music?: number } = {}): GalleryContext {
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const sequence = buildSequence({ photoCount: n, lengthMode, musicDuration: opts.music ?? null });
  const gallery = computeGallery({ sequence, aspects, portraitIndex: 1 % n, seed: 3 });
  const library = fakeLibrary(n, aspects, opts.hires === false ? [] : gallery.featured);
  const cells = CARPET.cols * CARPET.rows;
  const content: GalleryContent = {
    library,
    name: 'Tim Sparke',
    subtitle: '2026',
    stamp: '08:06:55 AM Monday November 28, 2011',
    dateLabel: '2011.11.28',
    captions: aspects.map((_, i) => `caption ${i}`),
    led: { small: new Texture(), large: new Texture(), full: new Texture(), highlight: new Texture() },
    mosaic: { colors: new Float32Array(cells * 3).fill(0.5), assignment: new Int32Array(cells).map((_, i) => (i * 7) % n) },
  };
  return { sequence, gallery, content, tex: fakeTextures(opts.textAspect), mats: createStageMaterials() };
}
```

- [ ] **Step 2: Write the failing test `tests/unit/gallery-shell.test.ts`**

```ts
import { InstancedMesh, Mesh, PlaneGeometry, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { toWorld } from '../../src/stage/frame';
import { buildLabels } from '../../src/stage/gallery/common';
import { buildPhotosRoom } from '../../src/stage/gallery/rooms/photos';
import { buildPortraitsRoom } from '../../src/stage/gallery/rooms/portraits';
import { buildWallRoom } from '../../src/stage/gallery/rooms/wall';
import { buildGalleryShell } from '../../src/stage/gallery/shell';
import type { Vec3 } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const meshNames = (root: Object3D) => { const out: string[] = []; root.traverse((o) => { if (o instanceof Mesh) out.push(o.name); }); return out.sort(); };
const worldPos = (o: Object3D): Vec3 => { o.updateWorldMatrix(true, false); return new Vector3().setFromMatrixPosition(o.matrixWorld).toArray() as Vec3; };

describe('gallery shell', () => {
  it('builds every wall, floor and block into its region; the robot door is timed', () => {
    const ctx = fakeGalleryContext(20);
    const shell = buildGalleryShell(ctx);
    const g = ctx.gallery;
    const expected = (region: string) => [...g.walls, ...g.floors, ...g.blocks].filter((x) => x.region === region).map((x) => x.name).sort();
    expect(meshNames(shell.walk)).toEqual(expected('walk'));
    expect(meshNames(shell.robots)).toEqual(expected('robots'));
    expect(meshNames(shell.both)).toEqual(expected('both'));
    expect(shell.timed).toHaveLength(1);
    expect(shell.timed[0].until).toBe(g.track.wipes.find((w) => w.name === 'robot-door')!.end);
  });

  it('puts each wall where its frame says, facing its room', () => {
    const ctx = fakeGalleryContext(20);
    const shell = buildGalleryShell(ctx);
    for (const name of ['recess-left', 'likes-wall', 'white-end']) {
      const w = ctx.gallery.walls.find((x) => x.name === name)!;
      const [mesh] = named(shell.walk, name);
      worldPos(mesh).forEach((v, i) => expect(v).toBeCloseTo(toWorld(w.frame, [w.center[0], w.center[1], 0])[i], 9));
    }
    const [recess] = named(shell.walk, 'recess-left');
    const normal = new Vector3(0, 0, 1).transformDirection(recess.matrixWorld);
    expect(normal.x).toBeCloseTo(1, 9);
  });
});

describe('white rooms', () => {
  it('hangs title, exhibition and intro in order along x, and a text column on the white block', () => {
    const ctx = fakeGalleryContext(20);
    const room = buildWallRoom(ctx);
    const [title] = named(room.group, 'title');
    const [exhibition] = named(room.group, 'exhibition');
    const [intro] = named(room.group, 'intro');
    expect(title.position.x).toBeLessThan(exhibition.position.x);
    expect(exhibition.position.x).toBeLessThan(intro.position.x);
    expect(exhibition.position.x).toBeCloseTo(ctx.gallery.wall.exhibition.center[0], 9);
    expect(named(room.group, 'intro-avatar')).toHaveLength(1);
    const [blockText] = named(room.group, 'block-text');
    const b = ctx.gallery.wall.blockText!;
    worldPos(blockText).forEach((v, i) => expect(v).toBeCloseTo(toWorld(b.frame, b.center)[i], 9));
  });

  it('a long name still fits the exhibition box', () => {
    const ctx = fakeGalleryContext(10, 'auto', { textAspect: 30 });
    const [exhibition] = named(buildWallRoom(ctx).group, 'exhibition') as Mesh[];
    expect((exhibition.geometry as PlaneGeometry).parameters.width).toBeLessThanOrEqual(ctx.gallery.wall.exhibition.width + 1e-9);
  });

  it('Friends and Photos hang every exhibit and visitor', () => {
    const ctx = fakeGalleryContext(30);
    const portraits = buildPortraitsRoom(ctx)!;
    expect(named(portraits.group, 'portrait-block')).toHaveLength(ctx.gallery.portraits!.items.length);
    const photos = buildPhotosRoom(ctx);
    const swarm = named(photos.group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(30);
    expect(named(photos.group, 'visitor')).toHaveLength(ctx.gallery.photos.visitors.length);
  });

  it('the photo swarm spreads more than 256 photos over two atlas meshes', () => {
    const swarm = named(buildPhotosRoom(fakeGalleryContext(300)).group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.map((m) => m.count)).toEqual([256, 44]);
  });

  it('the 30 s cut has no Friends and no block text', () => {
    const ctx = fakeGalleryContext(12, 30);
    expect(buildPortraitsRoom(ctx)).toBeNull();
    expect(named(buildWallRoom(ctx).group, 'block-text')).toHaveLength(0);
  });

  it('builds one sign per gallery label, each in its own frame', () => {
    const ctx = fakeGalleryContext(20);
    const signs = buildLabels(ctx);
    expect(signs.children).toHaveLength(ctx.gallery.labels.length);
    const likes = ctx.gallery.labels.find((l) => l.text === 'Likes')!;
    const [sign] = named(signs, 'label:Likes');
    worldPos(sign.children[0]).forEach((v, i) => expect(v).toBeCloseTo(toWorld(likes.frame, likes.at)[i], 9));
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/unit/gallery-shell.test.ts`
Expected: FAIL (cannot find module `../../src/stage/gallery/context`, imported by `fake-gallery.ts`).

- [ ] **Step 4: Write `src/stage/gallery/context.ts`**

```ts
import type { Group, Texture } from 'three';
import type { PhotoLibrary } from '../../assets/library';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { Sequence } from '../../types';
import type { Gallery } from '../gallery';
import type { StageMaterials } from '../parts/materials';

export interface GalleryContent {
  library: PhotoLibrary;
  name: string;
  subtitle: string;
  /** e.g. "08:06:55 AM Monday November 28, 2011" */
  stamp: string;
  /** e.g. "2026.09.28"; empty when no date was chosen. */
  dateLabel: string;
  captions: string[];
  /** LED wall rows for each phase (spec v4 §5) and the highlighted word. */
  led: { small: Texture; large: Texture; full: Texture; highlight: Texture };
  /** Portrait colour per carpet cell (flat rgb, row 0 at the far edge) and the photo chosen for each cell. */
  mosaic: { colors: Float32Array; assignment: Int32Array };
}

export interface GalleryContext {
  sequence: Sequence;
  gallery: Gallery;
  content: GalleryContent;
  tex: StageTextureFactory;
  mats: StageMaterials;
}

export interface RoomObject {
  group: Group;
  update?: (t: number) => void;
  /** Releases what is not in the scene graph (materials swapped in over time). */
  dispose?: () => void;
}

export function hiresOf(content: GalleryContent, index: number): Texture {
  const texture = content.library.hires.get(index);
  if (!texture) throw new Error(`photo ${index} is featured but has no high-resolution texture`);
  return texture;
}
```

- [ ] **Step 5: Write `src/stage/gallery/common.ts`**

```ts
import { BoxGeometry, Group, Mesh } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import { placeIn } from '../frame';
import type { Label } from '../gallery';
import type { VisitorSpot } from '../placement';
import type { StageMaterials } from '../parts/materials';
import { createTextPlane } from '../parts/text-plane';
import { createVisitor } from '../parts/visitor';
import type { GalleryContext } from './context';

/** Wall lettering: solid near-black, as printed vinyl in the original. */
export const INK = '#141414';
/** The original's section signs: the name is about 0.56 m wide at the Friends wall. */
export const LABEL_SIZE = { width: 0.95, height: 1.15 } as const;

const BLURBS: Record<string, string> = {
  Friends: 'The faces in this collection.',
  Photos: 'Moments worth keeping.',
  Location: 'Where and when.',
  Words: 'The words you use most.',
  Likes: 'Things you love.',
  Videos: 'Moving pictures.',
};

/** Section sign: icon, name, one line of description and the number (dark rooms use white lettering). */
export function createLabel(tex: StageTextureFactory, label: Label, mats: StageMaterials): Group {
  const outer = placeIn(label.frame, new Group());
  outer.name = `label:${label.text}`;
  const inner = new Group();
  inner.position.set(label.at[0], label.at[1], label.at[2]);
  const color = label.dark ? '#e6e6e6' : '#262626';
  const text = createTextPlane(
    tex.text({
      size: { width: 420, height: 520 },
      align: 'left',
      padding: 36,
      color,
      lines: [
        { text: '■', px: 40, weight: 500 },
        { text: label.text, px: 44, weight: 800, family: 'grotesk' },
        { text: BLURBS[label.text] ?? '', px: 22, weight: 500 },
        { text: label.number, px: 36, weight: 500, family: 'grotesk' },
      ],
    }),
    LABEL_SIZE.width,
    LABEL_SIZE.height,
  );
  text.position.z = 0.016;
  inner.add(text);
  if (!label.dark) {
    const backing = new Mesh(new BoxGeometry(LABEL_SIZE.width + 0.04, LABEL_SIZE.height + 0.04, 0.015), mats.plaque);
    backing.position.z = 0.0075;
    inner.add(backing);
  }
  outer.add(inner);
  return outer;
}

export function buildLabels(ctx: GalleryContext): Group {
  const group = new Group();
  group.name = 'labels';
  for (const label of ctx.gallery.labels) group.add(createLabel(ctx.tex, label, ctx.mats));
  return group;
}

export function addVisitors(group: Group, spots: VisitorSpot[], mats: StageMaterials): void {
  for (const s of spots) group.add(createVisitor(s, mats.visitor));
}
```

- [ ] **Step 6: Write `src/stage/gallery/shell.ts`**

```ts
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
```

- [ ] **Step 7: Write `src/stage/gallery/rooms/wall.ts`**

```ts
import { Group } from 'three';
import { placeIn } from '../../frame';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { createTextPlane } from '../../parts/text-plane';
import { INK } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

/** Greedy word wrap to lines of at most `width` characters. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildWallRoom(ctx: GalleryContext): RoomObject {
  const { gallery, content, tex, mats } = ctx;
  const w = gallery.wall;
  const group = new Group();
  group.name = 'room:wall';

  const title = createTextPlane(
    tex.text({
      color: INK,
      lineGap: 0.15,
      padding: 20,
      lines: [
        { text: 'The Museum of Me', px: 120, weight: 700, family: 'serif' },
        { text: 'Create and explore a visual archive of your social life.', px: 38, weight: 700 },
      ],
    }),
    w.title.width,
    w.title.height,
  );
  title.name = 'title';
  title.position.set(w.title.center[0], w.title.center[1], 0.01);

  const exhibition = createTextPlane(
    tex.text({
      align: 'left',
      color: INK,
      lineGap: 0.04,
      padding: 20,
      lines: [
        { text: content.name.toUpperCase(), px: 200, weight: 800, family: 'grotesk' },
        { text: 'EXHIBITION', px: 200, weight: 800, family: 'grotesk' },
        { text: content.stamp, px: 64, weight: 800, family: 'grotesk' },
      ],
    }),
    w.exhibition.width,
    w.exhibition.height,
  );
  exhibition.name = 'exhibition';
  exhibition.position.set(w.exhibition.center[0], w.exhibition.center[1], 0.01);
  group.add(title, exhibition);

  const sentence = `This exhibition is a journey of visualization that explores who ${content.name} is.`;
  if (w.intro) {
    const { avatar } = w.intro;
    const block = createCanvasBlock(hiresOf(content, avatar.photoIndex), content.library.aspects[avatar.photoIndex], avatar.width, avatar.height, mats.blockSide);
    block.name = 'intro-avatar';
    block.position.set(avatar.center[0], avatar.center[1], BLOCK_DEPTH / 2);
    const intro = createTextPlane(
      tex.text({
        align: 'left',
        color: INK,
        lineGap: 0.3,
        padding: 16,
        lines: [
          { text: 'This exhibition is a journey of', px: 64, weight: 700, family: 'serif' },
          { text: `visualization that explores who ${content.name} is.`, px: 64, weight: 700, family: 'serif' },
        ],
      }),
      w.intro.width,
      w.intro.height,
    );
    intro.name = 'intro';
    intro.position.set(w.intro.center[0], w.intro.center[1], 0.01);
    group.add(block, intro);
  }

  if (w.blockText) {
    const b = w.blockText;
    const text = createTextPlane(
      tex.text({ align: 'left', color: '#3a3a3a', lineGap: 0.6, padding: 12, lines: wrap(sentence, 24).map((line) => ({ text: line, px: 30, weight: 500 })) }),
      b.width,
      b.height,
    );
    text.name = 'block-text';
    text.position.set(b.center[0], b.center[1], b.center[2]);
    const holder = placeIn(b.frame, new Group());
    holder.add(text);
    group.add(holder);
  }
  return { group };
}
```

- [ ] **Step 8: Write `src/stage/gallery/rooms/portraits.ts`**

```ts
import { Group } from 'three';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { addVisitors } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

/** Friends: square canvases in a row at eye height (original 26–37 s). */
export function buildPortraitsRoom(ctx: GalleryContext): RoomObject | null {
  const { gallery, content, mats } = ctx;
  const p = gallery.portraits;
  if (!p) return null;
  const group = new Group();
  group.name = 'room:portraits';
  for (const item of p.items) {
    const block = createCanvasBlock(hiresOf(content, item.photoIndex), content.library.aspects[item.photoIndex], item.width, item.height, mats.blockSide);
    block.name = 'portrait-block';
    block.position.set(item.center[0], item.center[1], BLOCK_DEPTH / 2);
    group.add(block);
  }
  addVisitors(group, p.visitors, mats);
  return { group };
}
```

- [ ] **Step 9: Write `src/stage/gallery/rooms/photos.ts`**

```ts
import { BoxGeometry, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { CanvasItem } from '../../placement';
import { buildAtlasInstances } from '../../parts/atlas-mesh';
import { BLOCK_DEPTH } from '../../parts/canvas-block';
import { addVisitors } from '../common';
import type { GalleryContext, RoomObject } from '../context';

/** Photos: the swarm rising to the upper right, on the same wall as Friends (original 37–53 s). */
export function buildPhotosRoom(ctx: GalleryContext): RoomObject {
  const { gallery, content, mats } = ctx;
  const p = gallery.photos;
  const group = new Group();
  group.name = 'room:photos';
  const matrix = (item: CanvasItem) =>
    new Matrix4().compose(new Vector3(item.center[0], item.center[1], BLOCK_DEPTH / 2), new Quaternion(), new Vector3(item.width, item.height, 1));
  for (const mesh of buildAtlasInstances({
    geometry: new BoxGeometry(1, 1, BLOCK_DEPTH),
    library: content.library,
    items: p.items.map((item) => ({ photoIndex: item.photoIndex, matrix: matrix(item) })),
    material: (atlas) => mats.atlas(content.library.atlases[atlas], true),
    rect: 'fit',
  })) {
    mesh.name = 'photo-swarm';
    group.add(mesh);
  }
  addVisitors(group, p.visitors, mats);
  return { group };
}
```

- [ ] **Step 10: Run and confirm it passes**

Run: `npx vitest run tests/unit/gallery-shell.test.ts && npx tsc --noEmit`
Expected: PASS (8 passed), type check clean.

- [ ] **Step 11: Commit**

```bash
git add src/stage/gallery tests/unit/fake-gallery.ts tests/unit/gallery-shell.test.ts
git commit -m "feat(v4): gallery shell in frames, section signs and the white rooms"
```

---
### Task 6: Location and the Words LED wall

**Files:**
- Modify: `src/stage/parts/led.ts` (add `LED_V4`, `LedPhase`, `ledPhaseAt`, `ledRowOffset`) and `src/assets/text.ts` (add `rasterizeHighlight`).
- Create: `src/stage/gallery/rooms/location.ts`, `src/stage/gallery/rooms/words.ts`.
- Test: `tests/unit/gallery-dark.test.ts`

**Interfaces:**
- Consumes: `TRACK.words.switches`, `Track.ledSwitches` (Task 3); `Gallery.location`, `Gallery.words` (Task 4); `GalleryContext`, `addVisitors`, `placeIn` (Tasks 2 and 5).
- Produces:
  - `LED_V4 = { cols: 1280, rows: 192, dot: 3, window: 0.5, scroll: 1.5, phases: { small: { rows: 14, units: 200 }, large: { rows: 8, units: 114 }, full: { rows: 4, units: 58 } }, highlight: { cols: 320, rows: 96 } }`.
  - `type LedPhase = 'small' | 'large' | 'highlight' | 'full'` and `ledPhaseAt(u)`.
  - `ledRowOffset(row, secondsIntoPhase, units)`: the texture u-offset of a row, in `[0, 1 − window]`. Even rows move the text left, odd rows move it right.
  - `rasterizeHighlight(word, cols, rows): Uint8Array`: the word inside a thin frame.
  - `buildLocationRoom(ctx)` (null without Location) and `buildWordsRoom(ctx)` (null without Words). The row meshes are named `led-small`, `led-large` and `led-full`, plus one `led-highlight`.

- [ ] **Step 1: Write the failing test `tests/unit/gallery-dark.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/gallery-dark.test.ts`
Expected: FAIL (cannot find module `../../src/stage/gallery/rooms/location`).

- [ ] **Step 3: Append to `src/stage/parts/led.ts`**

Add at the top of the file:
```ts
import { TRACK } from '../../camera/track';
```
Append at the end of the file:
```ts
/** v4 LED wall (spec v4 §5): each phase is one texture of rows, twice as wide as the visible window, so rows can scroll. */
export const LED_V4 = {
  cols: 1280,
  rows: 192,
  dot: 3,
  /** Fraction of a row texture visible at once. */
  window: 0.5,
  /** Scroll speed in half-em units per second (estimated from the original). */
  scroll: 1.5,
  phases: { small: { rows: 14, units: 200 }, large: { rows: 8, units: 114 }, full: { rows: 4, units: 58 } },
  highlight: { cols: 320, rows: 96 },
} as const;

export type LedPhase = 'small' | 'large' | 'highlight' | 'full';

/** What the LED screen shows at fraction `u` of the Words segment (the screen changes its own content, original 75–86 s). */
export function ledPhaseAt(u: number): LedPhase {
  const [a, b, c, d] = TRACK.words.switches;
  return u < a ? 'small' : u < b ? 'large' : u < c ? 'highlight' : u < d ? 'full' : 'small';
}

/** Texture offset of LED row `row`, `seconds` into its phase: even rows move the text left, odd rows right. */
export function ledRowOffset(row: number, seconds: number, units: number): number {
  const travel = Math.min(1 - LED_V4.window, (LED_V4.scroll * Math.max(0, seconds)) / units);
  return row % 2 === 0 ? travel : 1 - LED_V4.window - travel;
}
```

- [ ] **Step 4: Append to `src/assets/text.ts`**

Add after `rasterizeLines`:
```ts
/** One word, centred inside a thin frame, as a cols × rows LED mask (the highlight box, original 79 s). */
export function rasterizeHighlight(word: string, cols: number, rows: number, family: FontFamily = 'grotesk', weight = 800): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = context2d(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, cols - 4, rows - 4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${Math.floor(rows * 0.6)}px ${FAMILY_STACKS[family]}`;
  ctx.fillText(word.toUpperCase(), cols / 2, rows / 2, cols - 16);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 255 : 0;
  return mask;
}
```

- [ ] **Step 5: Write `src/stage/gallery/rooms/location.ts`**

```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight } from 'three';
import type { ImageLike } from '../../../assets/texture-factory';
import { placeIn } from '../../frame';
import { addVisitors } from '../common';
import { hiresOf, type GalleryContext, type RoomObject } from '../context';

/** Location: three tall light boxes on the shallow dark wall (original 55–66 s); the faces use the v2 captions. */
export function buildLocationRoom(ctx: GalleryContext): RoomObject | null {
  const { gallery, content, tex, mats } = ctx;
  const loc = gallery.location;
  if (!loc) return null;
  const group = placeIn(loc.frame, new Group());
  group.name = 'room:location';
  loc.boxes.forEach((box, i) => {
    const face = tex.lightbox(hiresOf(content, box.photoIndex).image as ImageLike, [
      `NO. ${String(i + 1).padStart(3, '0')}`,
      content.captions[box.photoIndex] ?? '',
      content.dateLabel,
    ]);
    const frame = new Mesh(new BoxGeometry(box.width + 0.06, box.height + 0.06, 0.18), mats.lightboxFrame);
    frame.position.set(box.center[0], box.center[1], 0.09);
    const material = new MeshBasicMaterial({ map: face });
    material.color.setScalar(1.35);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const panel = new Mesh(new PlaneGeometry(box.width, box.height), material);
    panel.name = 'lightbox';
    panel.position.set(box.center[0], box.center[1], 0.181);
    const light = new PointLight(0x9fc3ff, 3, 6, 2);
    light.position.set(box.center[0], 1.2, 1.2);
    group.add(frame, panel, light);
  });
  addVisitors(group, loc.visitors, mats);
  return { group };
}
```

- [ ] **Step 6: Write `src/stage/gallery/rooms/words.ts`**

```ts
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
```

- [ ] **Step 7: Run and confirm it passes**

Run: `npx vitest run tests/unit/gallery-dark.test.ts && npx vitest run && npx tsc --noEmit`
Expected: gallery-dark 9 passed, the whole suite passes, type check clean.

- [ ] **Step 8: Commit**

```bash
git add src/stage/parts/led.ts src/assets/text.ts src/stage/gallery/rooms/location.ts src/stage/gallery/rooms/words.ts tests/unit/gallery-dark.test.ts
git commit -m "feat(v4): Location light boxes and the Words LED wall with alternating marquee rows"
```

---
### Task 7: The hall — thumb, old TVs, grid photo wall and the Videos wall

**Files:**
- Create: `src/stage/parts/crt.ts`, `src/stage/gallery/rooms/hall.ts`.
- Modify: `src/stage/parts/materials.ts` (add `crtBody`, `crtStand`).
- Test: `tests/unit/gallery-hall.test.ts`

**Interfaces:**
- Consumes: `Gallery.hall`, `HALL` (Task 4); `placeIn` (Task 2); `GalleryContext`, `RoomObject`, `addVisitors`, `hiresOf` (Task 5); `createThumbSculpture`, `cellTextureCropped`.
- Produces:
  - `createCrt({ body, stand, screen, width, height, standHeight }): Group` (named `crt`). The screen faces +z at the origin, the pole reaches the floor at −`standHeight`.
  - `coverRect(aspect, target)` and `videoPanelRect(col, row, cols, rows, cover, zoom, pan)`, moved from v3 `rooms/videos.ts`.
  - `buildHallRoom(ctx): RoomObject | null`, with `update(t)` and `dispose()`. Named meshes: `thumb`, `crt`, `grid-cell`, `video-panel`. Each grid material carries `userData.photoIndex`.

- [ ] **Step 1: Write the failing test `tests/unit/gallery-hall.test.ts`**

```ts
import { Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { findSegment, requireSegment } from '../../src/plan/sequence';
import { toWorld } from '../../src/stage/frame';
import { HALL } from '../../src/stage/gallery';
import { buildHallRoom, coverRect, videoPanelRect } from '../../src/stage/gallery/rooms/hall';
import type { Vec3 } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const worldPos = (o: Object3D): Vec3 => { o.updateWorldMatrix(true, false); return new Vector3().setFromMatrixPosition(o.matrixWorld).toArray() as Vec3; };
const photoOf = (m: Object3D) => ((m as Mesh).material as MeshBasicMaterial).userData.photoIndex as number;

describe('hall', () => {
  const ctx = fakeGalleryContext(20);
  const room = buildHallRoom(ctx)!;
  const hall = ctx.gallery.hall!;

  it('stands the thumb on its pedestal at the thumb anchor', () => {
    const [thumb] = named(room.group, 'thumb');
    worldPos(thumb).forEach((v, i) => expect(v).toBeCloseTo(toWorld(hall.thumb, [0, 0.55, 0])[i], 9));
  });

  it('lines the Likes wall with old TVs on stands, the colour-bar ones sharing one material', () => {
    expect(named(room.group, 'crt')).toHaveLength(HALL.crt.count);
    const screens = named(room.group, 'screen') as Mesh[];
    expect(screens).toHaveLength(HALL.crt.count);
    const bars = screens.filter((_, i) => hall.crts.screens[i].bars);
    expect(bars.length).toBeGreaterThan(0);
    expect(new Set(bars.map((s) => s.material)).size).toBe(1);
  });

  it('hangs the 6 × 5 grid and swaps its photos with time, purely in t', () => {
    const cells = named(room.group, 'grid-cell');
    expect(cells).toHaveLength(HALL.grid.cols * HALL.grid.rows);
    const { start, step } = hall.grid;
    room.update!(start);
    const first = cells.map(photoOf);
    expect(first).toEqual(hall.grid.cells.map((c) => c.photos[0]));
    room.update!(start + 3.5 * step);
    expect(cells.map(photoOf)).toEqual(hall.grid.cells.map((c) => c.photos[3]));
    room.update!(start);
    expect(cells.map(photoOf)).toEqual(first);
  });

  it('spreads one photo over the 12 Videos panels and pans it', () => {
    const panels = named(room.group, 'video-panel') as Mesh<never, MeshBasicMaterial>[];
    expect(panels).toHaveLength(HALL.videos.cols * HALL.videos.rows);
    const videos = requireSegment(ctx.sequence, 'videos');
    room.update!(videos.start);
    const before = panels[0].material.map!.offset.x;
    room.update!(videos.end);
    expect(panels[0].material.map!.offset.x).not.toBe(before);
  });

  it('works with three photos and disposes its swap materials', () => {
    const small = fakeGalleryContext(3);
    const r = buildHallRoom(small)!;
    const likes = requireSegment(small.sequence, 'likes');
    const robots = requireSegment(small.sequence, 'robots');
    for (let t = likes.start; t < robots.start; t += 0.4) r.update!(t);
    for (const c of named(r.group, 'grid-cell')) expect(photoOf(c)).toBeLessThan(3);
    expect(() => r.dispose!()).not.toThrow();
  });

  it('is not built without Likes', () => {
    const ctx60 = fakeGalleryContext(12, 60);
    expect(findSegment(ctx60.sequence, 'likes')).toBeFalsy();
    expect(buildHallRoom(ctx60)).toBeNull();
  });
});

describe('video wall maths', () => {
  it('coverRect crops to the target aspect', () => {
    expect(coverRect(2, 1)).toEqual([0.25, 0, 0.5, 1]);
    expect(coverRect(0.5, 1)).toEqual([0, 0.25, 1, 0.5]);
  });

  it('panels tile the zoomed rect without gaps inside the cover rect', () => {
    const cover = coverRect(1.5, 2.2);
    for (const [zoom, pan] of [[1, 0], [1.12, -0.04], [1.12, 0.04]] as const) {
      const rects = [0, 1, 2, 3].map((col) => videoPanelRect(col, 0, 4, 3, cover, zoom, pan));
      for (let i = 1; i < 4; i++) expect(rects[i][0]).toBeCloseTo(rects[i - 1][0] + rects[i - 1][2], 12);
      expect(rects[0][0]).toBeGreaterThanOrEqual(cover[0] - 1e-12);
      expect(rects[3][0] + rects[3][2]).toBeLessThanOrEqual(cover[0] + cover[2] + 1e-12);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/gallery-hall.test.ts`
Expected: FAIL (cannot find module `../../src/stage/gallery/rooms/hall`).

- [ ] **Step 3: Add the TV materials to `src/stage/parts/materials.ts`**

In `interface StageMaterials`, after `pillarLight: MeshStandardMaterial;`, add:
```ts
  crtBody: MeshStandardMaterial;
  crtStand: MeshStandardMaterial;
```
In `shared`, after `pillarLight: std(0xc4c3bf, 0.9),`, add:
```ts
    crtBody: std(0x2b2926, 0.55),
    crtStand: std(0x111111, 0.6),
```

- [ ] **Step 4: Write `src/stage/parts/crt.ts`**

```ts
import { BoxGeometry, CylinderGeometry, Group, Mesh, PlaneGeometry, type Material } from 'three';

/** An old tube TV on a pole (original 94–101 s): screen facing +z at the origin, the box behind, the foot on the floor. */
export function createCrt(o: { body: Material; stand: Material; screen: Material; width: number; height: number; standHeight: number }): Group {
  const group = new Group();
  group.name = 'crt';
  const w = o.width + 0.12;
  const h = o.height + 0.12;
  const d = 0.42;
  const box = new Mesh(new BoxGeometry(w, h, d), o.body);
  box.position.z = -d / 2 - 0.002;
  const screen = new Mesh(new PlaneGeometry(o.width, o.height), o.screen);
  screen.name = 'screen';
  const poleHeight = Math.max(0.05, o.standHeight - h / 2);
  const pole = new Mesh(new CylinderGeometry(0.025, 0.03, poleHeight, 10), o.stand);
  pole.position.set(0, -h / 2 - poleHeight / 2, -d / 2);
  const foot = new Mesh(new CylinderGeometry(0.22, 0.24, 0.03, 20), o.stand);
  foot.position.set(0, -o.standHeight + 0.015, -d / 2);
  group.add(box, screen, pole, foot);
  return group;
}
```

- [ ] **Step 5: Write `src/stage/gallery/rooms/hall.ts`**

```ts
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
  const pedestal = new Mesh(new CylinderGeometry(1.7, 1.8, 0.55, 48), mats.pedestal);
  pedestal.position.y = 0.275;
  const thumb = createThumbSculpture(mats.sculpture, 7);
  thumb.position.y = 0.55;
  // Lit from the upper left, as in the original.
  const spot = new SpotLight(0xffffff, 160, 24, 0.5, 0.6, 1.5);
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
      m.color.setScalar(0.7);
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
```

- [ ] **Step 6: Run and confirm it passes**

Run: `npx vitest run tests/unit/gallery-hall.test.ts && npx vitest run && npx tsc --noEmit`
Expected: gallery-hall 8 passed, the whole suite passes, type check clean.

- [ ] **Step 7: Commit**

```bash
git add src/stage/parts/crt.ts src/stage/parts/materials.ts src/stage/gallery/rooms/hall.ts tests/unit/gallery-hall.test.ts
git commit -m "feat(v4): the hall — thumb, old TVs, grid photo wall with changing photos, Videos wall"
```

---
### Task 8: Robot room, finale and the gallery world

**Files:**
- Create: `src/stage/gallery/rooms/robots.ts`, `src/stage/gallery/finale.ts`, `src/stage/gallery/world.ts`.
- Modify: `src/render/world-fades.ts` (add `aoIntensityFor`).
- Test: `tests/unit/gallery-finale.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–7; the v3 parts `createRobotArm`, `armAngles`, `buildAtlasInstances`, `createAtlasMaterial`, `cellTexture`, `cropTexture`, `textUnits`, `createTextPlane`, `disposeScene`.
- Produces:
  - `buildRobotsRoom(ctx): RoomObject`, placed in the robot frame.
  - `buildFinale(ctx): RoomObject & { blackoutAt(t): number }`, placed in the robot frame.
  - `EXPOSURE`, `BLOOM`, `bloomKeys(sequence, gallery): [number, number][]`, `bloomFrom(keys, t)`.
  - `interface GalleryWorld { scene; update(t); bloomAt(t, x); dispose() }` (the same shape as v3's `World`) and `buildGalleryWorld(sequence, gallery, content, tex): GalleryWorld`. Scene groups are named `walk`, `robots` and `both`.
  - `aoIntensityFor(glow): number`.

- [ ] **Step 1: Write the failing test `tests/unit/gallery-finale.test.ts`**

```ts
import { Color, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { findSegment, requireSegment } from '../../src/plan/sequence';
import { aoIntensityFor } from '../../src/render/world-fades';
import { CARPET } from '../../src/stage/gallery';
import { buildFinale } from '../../src/stage/gallery/finale';
import { buildRobotsRoom } from '../../src/stage/gallery/rooms/robots';
import { buildGalleryWorld } from '../../src/stage/gallery/world';
import type { LengthMode } from '../../src/types';
import { fakeGalleryContext } from './fake-gallery';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const count = (root: Object3D, name: string) => (named(root, name) as InstancedMesh[]).reduce((s, m) => s + m.count, 0);
const CUTS: { mode: LengthMode; music?: number }[] = [{ mode: 'auto' }, { mode: 30 }, { mode: 60 }, { mode: 90 }, { mode: 'music', music: 46 }, { mode: 'music', music: 300 }];

describe('robot room', () => {
  it('stands five moving arms and the floating photos in the robot frame', () => {
    const ctx = fakeGalleryContext(20);
    const room = buildRobotsRoom(ctx);
    expect(room.group.position.toArray()).toEqual(ctx.gallery.robots.frame.origin);
    const arms = named(room.group, 'robot-arm');
    expect(arms).toHaveLength(5);
    expect(count(room.group, 'floaters')).toBe(ctx.gallery.robots.floaters.length);
    const robots = requireSegment(ctx.sequence, 'robots');
    const grip = () => { room.group.updateMatrixWorld(true); return arms[0].getObjectByName('gripper')!.getWorldPosition(new Vector3()).toArray(); };
    room.update!(robots.start + 2);
    const a = grip();
    room.update!(robots.start + 6);
    expect(grip()).not.toEqual(a);
  });
});

describe('finale', () => {
  it('has one carpet tile per mosaic cell, across atlases for large libraries', () => {
    expect(count(buildFinale(fakeGalleryContext(20)).group, 'carpet-tiles')).toBe(CARPET.cols * CARPET.rows);
    expect(named(buildFinale(fakeGalleryContext(300)).group, 'carpet-tiles')).toHaveLength(2);
  });

  it('blacks out the room during the end of the dive', () => {
    const ctx = fakeGalleryContext(20);
    const finale = buildFinale(ctx);
    const dive = requireSegment(ctx.sequence, 'dive');
    const d = dive.end - dive.start;
    expect(finale.blackoutAt(dive.start + 0.5 * d)).toBe(0);
    expect(finale.blackoutAt(dive.end)).toBe(1);
    finale.update!(dive.start + 0.8 * d);
    const [blackout] = named(finale.group, 'blackout') as Mesh<never, MeshBasicMaterial>[];
    expect(blackout.visible).toBe(true);
    expect(blackout.material.opacity).toBeGreaterThan(0);
  });

  it('lifts, tints and shrinks the carpet into the portrait during the mosaic', () => {
    const ctx = fakeGalleryContext(20);
    const finale = buildFinale(ctx);
    const mosaic = requireSegment(ctx.sequence, 'mosaic');
    const [carpet] = named(finale.group, 'carpet');
    const [tiles] = named(finale.group, 'carpet-tiles') as InstancedMesh[];
    const [overlay] = named(finale.group, 'mosaic-overlay') as Mesh<never, MeshBasicMaterial>[];
    const c = new Color();
    finale.update!(mosaic.start);
    expect(carpet.position.toArray()).toEqual(ctx.gallery.finale.carpet);
    tiles.getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
    expect(overlay.material.opacity).toBe(0);
    finale.update!(mosaic.end - 1e-6);
    carpet.position.toArray().forEach((v, i) => expect(v).toBeCloseTo(ctx.gallery.finale.lifted[i], 3));
    expect(carpet.scale.x).toBeCloseTo(0.3, 3);
    expect(overlay.material.opacity).toBeCloseTo(1, 3);
    tiles.getColorAt(0, c);
    expect(c.r).not.toBe(1);
  });

  it('grows the network from the portrait sphere outwards; its lines never write depth (review I1)', () => {
    const ctx = fakeGalleryContext(30);
    const finale = buildFinale(ctx);
    const network = findSegment(ctx.sequence, 'network')!;
    const [core] = named(finale.group, 'network-core');
    const [nodes] = named(finale.group, 'network-nodes') as InstancedMesh[];
    const m = new Matrix4();
    const scaleOf = (i: number) => { nodes.getMatrixAt(i, m); return new Vector3().setFromMatrixScale(m).x; };
    finale.update!(network.start);
    expect(core.scale.x).toBe(0);
    expect(scaleOf(0)).toBe(0);
    finale.update!(network.end - 1e-6);
    expect(core.scale.x).toBe(1);
    expect(scaleOf(0)).toBeGreaterThan(0.1);
    const lines: LineSegments[] = [];
    finale.group.traverse((o) => { if (o instanceof LineSegments) lines.push(o); });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect((l.material as LineBasicMaterial).depthWrite).toBe(false);
  });

  it('fades the end card in', () => {
    const ctx = fakeGalleryContext(12);
    const finale = buildFinale(ctx);
    const ending = requireSegment(ctx.sequence, 'ending');
    const [card] = named(finale.group, 'end-card') as Mesh<never, MeshBasicMaterial>[];
    finale.update!(ending.start);
    expect(card.material.opacity).toBe(0);
    finale.update!((ending.start + ending.end) / 2);
    expect(card.material.opacity).toBe(1);
  });
});

describe('buildGalleryWorld', () => {
  it('shows the walk until the robot door, then only the robot room; the door leaves after its wipe', () => {
    const ctx = fakeGalleryContext(20);
    const world = buildGalleryWorld(ctx.sequence, ctx.gallery, ctx.content, ctx.tex);
    const [walk] = named(world.scene, 'walk');
    const [robots] = named(world.scene, 'robots');
    const [door] = named(world.scene, 'robot-door');
    const r = requireSegment(ctx.sequence, 'robots');
    const dive = requireSegment(ctx.sequence, 'dive');
    const wipe = ctx.gallery.track.wipes.find((w) => w.name === 'robot-door')!;
    world.update(r.start - 0.01);
    expect([walk.visible, robots.visible, door.parent!.visible]).toEqual([true, false, true]);
    world.update(r.start);
    expect([walk.visible, robots.visible, door.parent!.visible]).toEqual([false, true, true]);
    world.update(wipe.end + 0.01);
    expect(door.parent!.visible).toBe(false);
    world.update(dive.end + 0.1);
    expect(robots.visible).toBe(false);
  });

  it('changes bloom smoothly in every cut (review I3)', () => {
    for (const c of CUTS) {
      const ctx = fakeGalleryContext(8, c.mode, { music: c.music });
      const world = buildGalleryWorld(ctx.sequence, ctx.gallery, ctx.content, ctx.tex);
      const ending = requireSegment(ctx.sequence, 'ending');
      for (let t = 0; t + 1 / 30 < ending.start; t += 1 / 30) {
        expect(Math.abs(world.bloomAt(t + 1 / 30, 0) - world.bloomAt(t, 0)), `${c.mode} t=${t.toFixed(2)}`).toBeLessThan(0.05);
      }
      expect(world.bloomAt(0, 0)).toBeCloseTo(0.2, 9);
      expect(world.bloomAt(ctx.sequence.total, 0)).toBeCloseTo(0.25, 9);
    }
  });

  it('AO strength follows the bloom level continuously', () => {
    expect(aoIntensityFor(0.2)).toBeCloseTo(2.2, 12);
    expect(aoIntensityFor(1.1)).toBeCloseTo(1.0, 12);
    for (let g = 0.2; g < 1.1; g += 0.01) expect(Math.abs(aoIntensityFor(g + 0.01) - aoIntensityFor(g))).toBeLessThan(0.03);
  });

  it('updates at every time in every cut and disposes cleanly', () => {
    for (const c of CUTS) {
      const ctx = fakeGalleryContext(8, c.mode, { music: c.music });
      const world = buildGalleryWorld(ctx.sequence, ctx.gallery, ctx.content, ctx.tex);
      for (let t = 0; t <= ctx.sequence.total; t += 0.7) world.update(t);
      expect(() => world.dispose()).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/gallery-finale.test.ts`
Expected: FAIL (cannot find module `../../src/stage/gallery/finale` or `aoIntensityFor` is not exported).

- [ ] **Step 3: Add `aoIntensityFor` to `src/render/world-fades.ts`**

Change the import `import { smoothstep } from '../util/math';` to `import { lerp, smoothstep } from '../util/math';` and append:
```ts
/** N8AO strength for a bloom level: strong in the white rooms, soft where things glow — continuous (review I3). */
export function aoIntensityFor(glow: number): number {
  return lerp(2.2, 1.0, smoothstep(0.2, 1.1, glow));
}
```

- [ ] **Step 4: Write `src/stage/gallery/rooms/robots.ts`**

```ts
import { BoxGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type InstancedMesh } from 'three';
import { requireSegment } from '../../../plan/sequence';
import { placeIn } from '../../frame';
import type { Gallery } from '../../gallery';
import { buildAtlasInstances, cellTexture, type AtlasInstance } from '../../parts/atlas-mesh';
import { armAngles, createRobotArm } from '../../parts/robot-arm';
import type { GalleryContext, RoomObject } from '../context';

type Floater = Gallery['robots']['floaters'][number];

function floaterMatrix(f: Floater, t: number): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(0.2 * Math.sin(0.3 * t + f.phase), f.phase + 0.1 * t, 0));
  return new Matrix4().compose(new Vector3(f.pos[0], f.pos[1] + 0.15 * Math.sin(0.4 * t + f.phase), f.pos[2]), q, new Vector3(f.size, f.size, 1));
}

/** The white robot room straight ahead after the door (original 125–150 s). */
export function buildRobotsRoom(ctx: GalleryContext): RoomObject {
  const { gallery, content, mats, sequence } = ctx;
  const r = gallery.robots;
  const lib = content.library;
  const segment = requireSegment(sequence, 'robots');
  const group = placeIn(r.frame, new Group());
  group.name = 'room:robots';
  const p = r.platform;
  const platform = new Mesh(new BoxGeometry(p.width, p.height, p.depth), mats.platform);
  platform.position.set(p.center[0], p.center[1], p.center[2]);
  group.add(platform);

  const floaters = buildAtlasInstances({
    geometry: new PlaneGeometry(1, 1),
    library: lib,
    items: r.floaters.map((f) => ({ photoIndex: f.photoIndex, matrix: floaterMatrix(f, 0), floater: f })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], false, true),
    rect: 'fit',
  });
  for (const mesh of floaters) {
    mesh.name = 'floaters';
    group.add(mesh);
  }

  const arms = r.arms.map((spec, i) => {
    const heldMaterial = new MeshBasicMaterial({ map: cellTexture(lib, r.floaters[i % r.floaters.length].photoIndex, 'square'), side: DoubleSide });
    heldMaterial.userData.owned = true;
    heldMaterial.userData.ownsMap = true;
    const held = new Mesh(new PlaneGeometry(0.28, 0.28), heldMaterial);
    held.rotation.x = -Math.PI / 2;
    const arm = createRobotArm(mats.robot, held);
    arm.group.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    arm.group.rotation.y = spec.yaw;
    group.add(arm.group);
    return { arm, phase: spec.phase };
  });

  const update = (t: number) => {
    // Hidden until the door (review M8: no work while the room is out of the scene).
    if (t < segment.start - 0.5) return;
    for (const { arm, phase } of arms) arm.pose(armAngles(t, phase));
    for (const mesh of floaters as InstancedMesh[]) {
      (mesh.userData.items as (AtlasInstance & { floater: Floater })[]).forEach((item, i) => mesh.setMatrixAt(i, floaterMatrix(item.floater, t)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(segment.start);
  return { group, update };
}
```

- [ ] **Step 5: Write `src/stage/gallery/finale.ts`**

This is v3's `src/stage/world/finale.ts` with four changes:
- it uses the gallery context;
- it is placed in the robot frame;
- the network lines no longer write depth (review I1);
- positions come from `gallery.finale`, which is local to that frame.

```ts
import {
  AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, SphereGeometry, Vector3, type InstancedMesh, type Material,
} from 'three';
import { findSegment, localU, requireSegment } from '../../plan/sequence';
import type { Vec3 } from '../../types';
import { clamp, lerp, smoothstep } from '../../util/math';
import { placeIn } from '../frame';
import { CARPET } from '../gallery';
import { buildAtlasInstances, createAtlasMaterial, type AtlasInstance } from '../parts/atlas-mesh';
import { cropTexture } from '../parts/canvas-block';
import { textUnits } from '../parts/led';
import { createTextPlane } from '../parts/text-plane';
import { hiresOf, type GalleryContext, type RoomObject } from './context';

/** Multiplier that brings a photo's average colour to the cell colour (softened, clamped). */
const tintOf = (cell: number, photo: number) => 1 + (clamp(cell / Math.max(photo, 0.04), 0, 3) - 1) * 0.9;

type CarpetItem = AtlasInstance & { tint: [number, number, number] };
type NodeItem = AtlasInstance & { pos: Vec3; radius: number; delay: number };

export function buildFinale(ctx: GalleryContext): RoomObject & { blackoutAt(t: number): number } {
  const { sequence, gallery, content, tex, mats } = ctx;
  const lib = content.library;
  const fin = gallery.finale;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const d = dive.end - dive.start;
  const group = placeIn(fin.frame, new Group());
  group.name = 'finale';
  const owned = <M extends Material>(m: M, ownsMap = false): M => {
    m.userData.owned = true;
    m.userData.ownsMap = ownsMap;
    return m;
  };

  // Everything but the carpet fades to black: a back-faced shell drawn over the room, the carpet drawn after it.
  const blackoutMaterial = owned(new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  const blackout = new Mesh(new SphereGeometry(120, 32, 16), blackoutMaterial);
  blackout.name = 'blackout';
  blackout.renderOrder = 5;
  blackout.frustumCulled = false;
  blackout.position.set(fin.lifted[0], fin.lifted[1], fin.lifted[2]);
  blackout.visible = false;
  const blackoutAt = (t: number) => smoothstep(dive.start + 0.6 * d, dive.end, t);

  // Carpet = the mosaic, laid out on the platform from the start.
  const { cols, rows, pitch, tile } = CARPET;
  const carpet = new Group();
  carpet.name = 'carpet';
  carpet.position.set(fin.carpet[0], fin.carpet[1], fin.carpet[2]);
  const { colors, assignment } = content.mosaic;
  const items: CarpetItem[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const photo = assignment[i];
      const pc = lib.colors[photo];
      items.push({
        photoIndex: photo,
        matrix: new Matrix4().makeTranslation((c - (cols - 1) / 2) * pitch, 0, (r - (rows - 1) / 2) * pitch),
        color: new Color(1, 1, 1),
        tint: [tintOf(colors[i * 3], pc[0]), tintOf(colors[i * 3 + 1], pc[1]), tintOf(colors[i * 3 + 2], pc[2])],
      });
    }
  }
  const carpetMaterials = new Map<number, Material>();
  const tiles = buildAtlasInstances({
    geometry: new PlaneGeometry(tile, tile).rotateX(-Math.PI / 2),
    library: lib,
    items,
    material: (atlas) => {
      let m = carpetMaterials.get(atlas);
      if (!m) {
        m = owned(createAtlasMaterial(lib.atlases[atlas], false));
        m.transparent = true; // drawn in the transparent pass, after the blackout shell
        carpetMaterials.set(atlas, m);
      }
      return m;
    },
    rect: 'square',
  });
  for (const mesh of tiles) {
    mesh.name = 'carpet-tiles';
    mesh.renderOrder = 10;
    carpet.add(mesh);
  }
  const portrait = hiresOf(content, gallery.portraitIndex);
  const overlayMaterial = owned(
    new MeshBasicMaterial({ map: cropTexture(portrait, lib.aspects[gallery.portraitIndex], cols / rows), transparent: true, opacity: 0, depthWrite: false }),
    true,
  );
  const overlay = new Mesh(new PlaneGeometry(cols * pitch, rows * pitch).rotateX(-Math.PI / 2), overlayMaterial);
  overlay.name = 'mosaic-overlay';
  overlay.position.y = 0.004;
  overlay.renderOrder = 11;
  carpet.add(overlay);

  // Network around the lifted portrait.
  const net = fin.network;
  const networkGroup = new Group();
  networkGroup.name = 'network';
  networkGroup.position.set(fin.lifted[0], fin.lifted[1], fin.lifted[2]);
  networkGroup.visible = false;
  const core = new Mesh(new SphereGeometry(0.55, 48, 32), owned(new MeshBasicMaterial({ map: portrait })));
  core.name = 'network-core';
  core.scale.setScalar(0);
  networkGroup.add(core);
  const order = net.nodes.map((n, i) => ({ i, d: Math.hypot(...n.pos) })).sort((a, b) => a.d - b.d);
  const delays = new Array<number>(net.nodes.length);
  order.forEach(({ i }, rank) => { delays[i] = 0.05 + (0.45 * rank) / Math.max(1, order.length - 1); });
  const nodeItems: NodeItem[] = net.nodes.map((n, i) => ({
    photoIndex: n.photoIndex, matrix: new Matrix4().makeScale(0, 0, 0), pos: n.pos, radius: n.radius, delay: delays[i],
  }));
  const nodeMeshes = nodeItems.length
    ? buildAtlasInstances({ geometry: new SphereGeometry(1, 20, 14), library: lib, items: nodeItems, material: (a) => mats.atlas(lib.atlases[a], false), rect: 'square' })
    : [];
  for (const mesh of nodeMeshes) {
    mesh.name = 'network-nodes';
    mesh.frustumCulled = false; // its bounding sphere was computed at scale 0
    networkGroup.add(mesh);
  }
  const lines = (positions: number[], color: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // Transparent lines must not write depth: at opacity 0 they would still cut through the carpet (review I1).
    return new LineSegments(geometry, owned(new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })));
  };
  const posOf = (i: number): Vec3 => (i < 0 ? [0, 0, 0] : net.nodes[i].pos);
  const edges = lines(net.edges.flatMap(([a, b]) => [...posOf(a), ...posOf(b)]), 0x9aa7b8);
  const star = (i: number) => net.stars.slice(i * 3, i * 3 + 3);
  const starEdges = lines(net.starEdges.flatMap(([a, b]) => [...star(a), ...star(b)]), 0x3b6fb6);
  const points = (positions: number[], size: number, color: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const p = new Points(geometry, owned(new PointsMaterial({ size, color, map: tex.glow(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }), true));
    p.name = name;
    return p;
  };
  const stars = points(net.stars, 0.16, 0xdfe8ff, 'stars');
  const highlights = points(net.highlights.flatMap(star), 0.28, 0x4aa3ff, 'highlights');
  networkGroup.add(edges, starEdges, stars, highlights);

  // End card, far below, framed by the fixed ending camera.
  const cardGroup = new Group();
  cardGroup.position.set(fin.card[0], fin.card[1], fin.card[2]);
  cardGroup.visible = false;
  const name = content.name.toUpperCase();
  const cardTexture = tex.text({
    size: { width: 1760, height: 1080 },
    background: '#f4f4f2',
    align: 'left',
    padding: 150,
    lineGap: 0.12,
    lines: [
      { text: 'The Museum of Me', px: 84, weight: 700, family: 'serif', color: '#1d1d1d' },
      { text: name, px: Math.min(150, Math.floor(1400 / Math.max(1, textUnits(name) * 0.6))), weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: 'EXHIBITION', px: 150, weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: content.dateLabel, px: 40, weight: 500, family: 'grotesk', color: '#666666' },
    ],
  });
  const cardMaterial = owned(new MeshBasicMaterial({ map: cardTexture.texture, transparent: true, opacity: 0 }), true);
  const card = new Mesh(new PlaneGeometry(4.4, 2.7), cardMaterial);
  card.name = 'end-card';
  card.rotation.set(-0.12, 0.22, 0);
  const tagline = createTextPlane(tex.text({ color: '#e8e8e8', lines: [{ text: 'Create and explore a visual archive of your memories.', px: 36, weight: 300 }] }), 4.6, 0.3);
  tagline.name = 'tagline';
  tagline.position.y = -1.95;
  const taglineMaterial = tagline.material as MeshBasicMaterial;
  taglineMaterial.opacity = 0;
  cardGroup.add(card, tagline);

  group.add(blackout, carpet, networkGroup, cardGroup);

  const carpetFrom = new Vector3(...fin.carpet);
  const carpetTo = new Vector3(...fin.lifted);
  let lastTint = -1;
  const q = new Quaternion();
  const m = new Matrix4();
  const v = new Vector3();
  const s3 = new Vector3();

  const update = (t: number) => {
    const b = blackoutAt(t);
    blackout.visible = b > 0 && t < dive.end;
    blackoutMaterial.opacity = b;

    const mu = localU(mosaic, t);
    const lift = smoothstep(0, 0.4, mu);
    carpet.position.lerpVectors(carpetFrom, carpetTo, lift);
    carpet.rotation.set(-0.35 * lift, 0.25 * lift + 0.12 * mu, 0);
    let scale = lerp(1, 0.3, smoothstep(0.55, 1, mu));
    overlayMaterial.opacity = smoothstep(0.55, 0.85, mu);
    const k = smoothstep(0.1, 0.7, mu);
    if (k !== lastTint) {
      lastTint = k;
      const c = new Color();
      for (const mesh of tiles as InstancedMesh[]) {
        (mesh.userData.items as CarpetItem[]).forEach((item, i) => mesh.setColorAt(i, c.setRGB(1 + (item.tint[0] - 1) * k, 1 + (item.tint[1] - 1) * k, 1 + (item.tint[2] - 1) * k)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    const nu = network ? localU(network, t) : 0;
    if (network && t >= network.start) scale *= 1 - smoothstep(0, 0.1, nu);
    carpet.scale.setScalar(Math.max(scale, 1e-4));
    carpet.visible = t < ending.start && !(network && t >= network.start + 0.1 * (network.end - network.start));

    networkGroup.visible = !!network && t >= network.start && t < ending.start;
    if (network && networkGroup.visible) {
      core.scale.setScalar(smoothstep(0.02, 0.12, nu));
      for (const mesh of nodeMeshes as InstancedMesh[]) {
        (mesh.userData.items as NodeItem[]).forEach((item, i) => {
          const s = item.radius * smoothstep(item.delay, item.delay + 0.12, nu);
          mesh.setMatrixAt(i, m.compose(v.set(...item.pos), q, s3.set(s, s, s)));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      (edges.material as LineBasicMaterial).opacity = 0.5 * smoothstep(0.1, 0.5, nu);
      const late = smoothstep(0.4, 0.7, nu);
      (starEdges.material as LineBasicMaterial).opacity = 0.35 * late;
      (stars.material as PointsMaterial).opacity = late;
      (highlights.material as PointsMaterial).opacity = late;
      networkGroup.rotation.y = 0.06 * (t - network.start);
    }

    cardGroup.visible = t >= ending.start;
    const eu = localU(ending, t);
    const a = smoothstep(0, 0.35, eu);
    cardMaterial.opacity = a;
    card.position.y = -0.25 * (1 - a);
    taglineMaterial.opacity = smoothstep(0.25, 0.55, eu);
  };
  update(0);
  return { group, update, blackoutAt };
}
```

- [ ] **Step 6: Write `src/stage/gallery/world.ts`**

```ts
import { Color, DirectionalLight, Group, HemisphereLight, Scene } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import { findSegment, requireSegment } from '../../plan/sequence';
import type { Sequence } from '../../types';
import { smoothstep } from '../../util/math';
import { disposeScene } from '../dispose';
import type { Gallery } from '../gallery';
import { createStageMaterials } from '../parts/materials';
import { buildLabels } from './common';
import type { GalleryContent, GalleryContext, RoomObject } from './context';
import { buildFinale } from './finale';
import { buildHallRoom } from './rooms/hall';
import { buildLocationRoom } from './rooms/location';
import { buildPhotosRoom } from './rooms/photos';
import { buildPortraitsRoom } from './rooms/portraits';
import { buildRobotsRoom } from './rooms/robots';
import { buildWallRoom } from './rooms/wall';
import { buildWordsRoom } from './rooms/words';
import { buildGalleryShell } from './shell';

export interface GalleryWorld {
  scene: Scene;
  update(t: number): void;
  /** Bloom intensity at time t (the x argument is kept for the renderer's interface). */
  bloomAt(t: number, x: number): number;
  dispose(): void;
}

/** Gallery light level, measured against the original: its white walls sit at ~160 (sRGB), not near white. */
export const EXPOSURE = 0.35;
export const BLOOM = { light: 0.2, dark: 1.1, hall: 0.6, mosaic: 0.3, ending: 0.25 } as const;

/** Bloom levels over time: dark rooms glow more, and every change is a ramp (review I3). */
export function bloomKeys(sequence: Sequence, gallery: Gallery): [number, number][] {
  const keys: [number, number][] = [[0, BLOOM.light]];
  let level: number = BLOOM.light;
  const ramp = (t0: number, t1: number, to: number) => {
    keys.push([t0, level], [t1, to]);
    level = to;
  };
  const pillar = gallery.track.wipes.find((w) => w.name === 'dark-pillar');
  const likes = findSegment(sequence, 'likes');
  const robots = requireSegment(sequence, 'robots');
  const dive = requireSegment(sequence, 'dive');
  const network = findSegment(sequence, 'network');
  if (pillar) ramp(pillar.mid - 0.6, pillar.mid + 0.6, BLOOM.dark);
  if (likes) ramp(likes.start, likes.start + 1.5, BLOOM.hall);
  ramp(robots.start - 0.3, robots.start + 0.3, BLOOM.light);
  ramp(dive.end - 0.2 * (dive.end - dive.start), dive.end, BLOOM.mosaic);
  if (network) ramp(network.start, network.start + Math.max(1.5, 0.12 * (network.end - network.start)), BLOOM.dark);
  return keys;
}

export function bloomFrom(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + (v1 - v0) * smoothstep(t0, t1, t);
    }
  }
  return keys[keys.length - 1][1];
}

export function buildGalleryWorld(sequence: Sequence, gallery: Gallery, content: GalleryContent, tex: StageTextureFactory): GalleryWorld {
  const mats = createStageMaterials();
  const ctx: GalleryContext = { sequence, gallery, content, tex, mats };
  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new HemisphereLight(0xffffff, 0xcfcac2, 1.15 * EXPOSURE));
  const sun = new DirectionalLight(0xffffff, 0.5 * EXPOSURE);
  sun.position.set(-20, 30, 40);
  scene.add(sun);

  const shell = buildGalleryShell(ctx);
  const walk = new Group();
  walk.name = 'walk';
  walk.add(shell.walk, buildLabels(ctx));
  const robotsGroup = new Group();
  robotsGroup.name = 'robots';
  robotsGroup.add(shell.robots);
  const both = new Group();
  both.name = 'both';
  both.add(shell.both);

  const walkUpdates: ((t: number) => void)[] = [];
  const disposers: (() => void)[] = [];
  const rooms: (RoomObject | null)[] = [buildWallRoom(ctx), buildPortraitsRoom(ctx), buildPhotosRoom(ctx), buildLocationRoom(ctx), buildWordsRoom(ctx), buildHallRoom(ctx)];
  for (const room of rooms) {
    if (!room) continue;
    walk.add(room.group);
    if (room.update) walkUpdates.push(room.update);
    if (room.dispose) disposers.push(room.dispose);
  }
  const robotsRoom = buildRobotsRoom(ctx);
  robotsGroup.add(robotsRoom.group);
  const finale = buildFinale(ctx);
  scene.add(walk, robotsGroup, both, finale.group);

  const robots = requireSegment(sequence, 'robots');
  const dive = requireSegment(sequence, 'dive');
  const ending = requireSegment(sequence, 'ending');
  const keys = bloomKeys(sequence, gallery);

  return {
    scene,
    update(t) {
      // The robot room takes over while the dark door covers the lens.
      walk.visible = t < robots.start;
      robotsGroup.visible = t >= robots.start && t < dive.end;
      both.visible = t < dive.end;
      for (const s of shell.timed) s.object.visible = t < s.until;
      if (walk.visible) for (const u of walkUpdates) u(t);
      robotsRoom.update!(t);
      finale.update!(t);
    },
    bloomAt(t) {
      return t >= ending.start ? BLOOM.ending : bloomFrom(keys, t);
    },
    dispose() {
      disposeScene(scene);
      for (const d of disposers) d();
      mats.dispose();
    },
  };
}
```

- [ ] **Step 7: Run and confirm it passes**

Run: `npx vitest run tests/unit/gallery-finale.test.ts && npx vitest run && npx tsc --noEmit`
Expected: gallery-finale 10 passed, the whole suite passes, type check clean.

- [ ] **Step 8: Commit**

```bash
git add src/render/world-fades.ts src/stage/gallery/rooms/robots.ts src/stage/gallery/finale.ts src/stage/gallery/world.ts tests/unit/gallery-finale.test.ts
git commit -m "feat(v4): robot room and finale in the robot frame, region swap, smooth bloom and AO"
```

---
### Task 9: Gallery camera path

**Files:**
- Create: `src/camera/gallery-path.ts`
- Test: `tests/unit/gallery-path.test.ts`

**Interfaces:**
- Consumes: `Gallery` (Task 4); `Track.pos`, `Track.target`, `Track.focus`, `Track.exit` (Task 3); `toLocal`, `toLocalDir`, `toWorld` (Task 2); `createSpline`.
- Produces: `interface PathPose { pos; target; fov; focus }`, `interface CameraPath { duration; poseAt(t) }` (the same shape as v3), and `buildGalleryPath(sequence, gallery): CameraPath`.
  - Before `dive.start` it returns the track.
  - From the dive on, it follows splines in the robot frame. They start from the track's exit position and velocity, so the dive never whips backwards (review I4).
  - FOV is 38° until the ending card, and focus blends from the walk into the dive (review I2).
  - The network keys stay outside the star shell once the stars show (review M2).

- [ ] **Step 1: Write the failing test `tests/unit/gallery-path.test.ts`**

```ts
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
      const F = gallery.robots.frame;
      const d = dive.end - dive.start;
      for (let t = dive.start; t < dive.start + 0.35 * d; t += 0.1) {
        const v = toLocalDir(F, scale(sub(path.poseAt(t + 0.02).pos, path.poseAt(t).pos), 50));
        expect(v[2], `${c.mode}/${c.music} t=${t.toFixed(2)}`).toBeLessThan(0.05);
      }
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
      const a = -0.06 * (t - network.start);
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/gallery-path.test.ts`
Expected: FAIL (cannot find module `../../src/camera/gallery-path`).

- [ ] **Step 3: Write `src/camera/gallery-path.ts`**

```ts
import { findSegment, requireSegment } from '../plan/sequence';
import { length, scale, sub, toLocal, toLocalDir, toWorld } from '../stage/frame';
import type { Gallery } from '../stage/gallery';
import type { Sequence, Vec3 } from '../types';
import { lerp, smoothstep } from '../util/math';
import { createSpline, type SplineKey } from './spline';
import { TRACK } from './track';

export interface PathPose {
  pos: Vec3;
  target: Vec3;
  fov: number;
  /** Distance to keep in focus (depth of field). */
  focus: number;
}

export interface CameraPath {
  readonly duration: number;
  poseAt(t: number): PathPose;
}

/** The measured walk, then the dive, mosaic and network in the robot frame. */
export function buildGalleryPath(sequence: Sequence, gallery: Gallery): CameraPath {
  const track = gallery.track;
  const F = gallery.finale.frame;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const P = gallery.robots.platform.center;
  const C = gallery.finale.lifted;
  const t0 = dive.start;
  const d = dive.end - dive.start;
  const m = mosaic.end - mosaic.start;

  // Leave the walk with its own position and velocity: the dive keeps going forward (review I4).
  const exitTarget = track.target.at(t0);
  const targetVel = scale(sub(exitTarget, track.target.at(t0 - 1e-3)), 1e3);
  const posKeys: SplineKey[] = [
    { t: t0, value: toLocal(F, track.exit.pos), velocity: toLocalDir(F, track.exit.vel) },
    { t: t0 + 0.35 * d, value: [P[0], 1.35, P[2] + 3.8] },
    { t: t0 + 0.7 * d, value: [P[0] - 0.3, 0.95, P[2] + 1.6] },
    { t: dive.end, value: [P[0], 4.2, P[2] + 1.2] },
    // As in the original: by a third of the mosaic the whole lifted carpet is in frame, then it shrinks away.
    { t: mosaic.start + 0.35 * m, value: [C[0], C[1] + 11, C[2] + 7] },
    { t: mosaic.end, value: [C[0], C[1] + 8.5, C[2] + 5] },
  ];
  const targetKeys: SplineKey[] = [
    { t: t0, value: toLocal(F, exitTarget), velocity: toLocalDir(F, targetVel) },
    { t: t0 + 0.35 * d, value: [P[0], 0.6, P[2]] },
    { t: t0 + 0.7 * d, value: [P[0] + 3, 0.4, P[2] - 0.6] },
    { t: dive.end, value: [P[0], 0.4, P[2]] },
    { t: mosaic.start + 0.35 * m, value: C },
    { t: mosaic.end, value: C },
  ];
  if (network) {
    const n = network.end - network.start;
    // Past the outer nodes to just outside the star shell (radius 11.5–12.5, review M2), then back until the whole sphere fills the frame.
    posKeys.push({ t: network.start + 0.5 * n, value: [C[0] + 3, C[1] + 12, C[2] + 7.5] }, { t: network.end, value: [C[0], C[1] + 22, C[2] + 15.5] });
    targetKeys.push({ t: network.start + 0.5 * n, value: C }, { t: network.end, value: C });
  }
  const pos = createSpline(posKeys);
  const target = createSpline(targetKeys);
  const walkFocus = track.focus.at(t0);
  const card = gallery.finale.card;

  return {
    duration: sequence.total,
    poseAt(t) {
      if (t >= ending.start) {
        return { pos: toWorld(F, [card[0], card[1], card[2] + 6.2]), target: toWorld(F, [card[0], card[1] - 0.2, card[2]]), fov: 35, focus: 6.2 };
      }
      if (t < t0) return { pos: track.pos.at(t), target: track.target.at(t), fov: TRACK.fov, focus: Math.max(0.8, track.focus.at(t)) };
      const p = pos.at(t);
      const q = target.at(t);
      // Hand the focus over from the walk instead of snapping to the look distance (review I2).
      const focus = lerp(walkFocus, length(sub(p, q)), smoothstep(t0, t0 + 0.2 * d, t));
      return { pos: toWorld(F, p), target: toWorld(F, q), fov: TRACK.fov, focus: Math.max(0.8, focus) };
    },
  };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/unit/gallery-path.test.ts && npx vitest run && npx tsc --noEmit`
Expected: gallery-path 6 passed, the whole suite passes, type check clean.
- If the star test fails, raise the mid network key (for example `C[1] + 13`), keeping the key radius at 14 m or more.
- If the obstacle test fails on `arm`, move that arm spot in `gallery.ts`, not the dive keys.
- Ledger any ruling.

- [ ] **Step 5: Commit**

```bash
git add src/camera/gallery-path.ts tests/unit/gallery-path.test.ts
git commit -m "feat(v4): camera path — measured walk, forward dive, 38° lens and continuous focus"
```

---
### Task 10: Switch the project to v4 and retire the v3 strip

**Files:**
- Modify: `src/app/project.ts` (whole file replaced), `src/render/world-renderer.ts`, `tests/e2e/preview.spec.ts`, `tests/e2e/acceptance.spec.ts` (whole file replaced), `README.md`.
- Delete: `src/stage/strip.ts`, `src/stage/world/` (every file), `src/camera/path.ts`, `tests/unit/strip.test.ts`, `tests/unit/path.test.ts`, `tests/unit/world-rooms.test.ts`, `tests/unit/world-dark.test.ts`, `tests/unit/world-finale.test.ts`, `tests/unit/fake-world.ts`.

**Interfaces:**
- Consumes: `computeGallery`, `CARPET` (Task 4); `buildGalleryWorld`, `GalleryWorld`, `EXPOSURE` (Task 8); `buildGalleryPath`, `CameraPath` (Task 9); `LED_V4` (Task 6); `rasterizeHighlight` (Task 6); `computeTrack`, `gallerySpeed` (Tasks 3–4); `aoIntensityFor` (Task 8).
- Produces: `Project { input; sequence; gallery; world; camera; soundtrack; warnings; dispose() }`. `main.ts` reads only `sequence`, `world` and `camera`, so it does not change.

- [ ] **Step 1: Update the e2e one-take check in `tests/e2e/preview.spec.ts` (it should fail first)**

Replace the import block at the top of the file (lines 1–4) with:
```ts
import { expect, test, type Page } from '@playwright/test';
import { computeTrack } from '../../src/camera/track';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import { gallerySpeed } from '../../src/stage/gallery';
import type { SegmentId } from '../../src/types';
import { fillSetup } from './helpers';
```
Replace the line
```ts
  const roomStarts = (['portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots'] as const).map((id) => requireSegment(sequence, id).start);
```
with
```ts
  // Only the three wipes and the LED screen's own content switches may change the whole picture (spec v4 §8).
  const track = computeTrack(sequence, gallerySpeed(sequence));
  const excused: [number, number][] = [...track.wipes.map((w): [number, number] => [w.start - 0.5, w.end + 0.5]), ...track.ledSwitches.map((s): [number, number] => [s - 0.8, s + 0.8])];
```
Replace the line
```ts
    const nearBoundary = roomStarts.some((s) => Math.abs(t - s) < 1.3);
```
with
```ts
    const nearBoundary = excused.some(([a, b]) => t >= a && t <= b);
```

Run: `npx playwright test tests/e2e/preview.spec.ts`
Expected: FAIL. The app still runs the v3 stage, so either the v3 pillars at every room start or the brightness per segment breaks the v4 expectations. The first failing assertion shows which.

- [ ] **Step 2: Replace `src/app/project.ts`**

```ts
import { bitmapToTexture, loadHires, loadLibrary } from '../assets/library';
import type { PhotoPool } from '../assets/photo-pool';
import { createCanvasTextureFactory, ensureFonts, rasterizeHighlight, rasterizeLines } from '../assets/text';
import { buildSoundtrack, probeAudioDuration } from '../audio/soundtrack';
import { buildGalleryPath, type CameraPath } from '../camera/gallery-path';
import { buildSequence } from '../plan/sequence';
import { CARPET, computeGallery, type Gallery } from '../stage/gallery';
import { buildGalleryWorld, type GalleryWorld } from '../stage/gallery/world';
import { LED_V4, ledLines, ledWords } from '../stage/parts/led';
import type { ProjectInput, Sequence } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { exhibitionDate, formatDisplayDate, formatExhibitionStamp } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  sequence: Sequence;
  gallery: Gallery;
  world: GalleryWorld;
  camera: CameraPath;
  soundtrack: AudioBuffer;
  warnings: string[];
  dispose(): void;
}

export async function buildProject(input: ProjectInput, pool: PhotoPool, onStatus: (message: string) => void): Promise<Project> {
  const words = ledWords(input.keywords, input.name, input.subtitle);
  onStatus('載入字型…');
  await ensureFonts([
    'The Museum of Me Create and explore a visual archive of your social life memories.',
    'This exhibition is a journey of visualization that explores who is. EXHIBITION ■ NO. 0123456789:,.APM',
    'Friends Photos Location Words Likes Videos The faces in this collection. Moments worth keeping. Where and when.',
    input.name, input.name.toUpperCase(), input.subtitle, ...words, ...words.map((w) => w.toUpperCase()), ...input.captions,
  ]);

  let musicDuration: number | null = null;
  if (input.durationMode === 'music') {
    if (!input.music) throw new Error('「配合音樂長度」需要先上傳音樂檔');
    try {
      musicDuration = await probeAudioDuration(input.music);
    } catch {
      throw new Error(`無法讀取音樂檔「${input.music.name}」，無法配合音樂長度`);
    }
  }

  onStatus(`處理照片 0 / ${input.photos.length}`);
  const { library, failed } = await loadLibrary(input.photos, pool, (done, total) => onStatus(`處理照片 ${done} / ${total}`));
  const cleanup: (() => void)[] = [() => library.dispose()];
  try {
    const warnings: string[] = [];
    if (failed.length > 0) warnings.push(`無法讀取 ${failed.length} 張照片，已略過：${failed.slice(0, 10).join('、')}${failed.length > 10 ? '…' : ''}`);
    if (library.count < MIN_PHOTOS) throw new Error(`可用的照片不足 ${MIN_PHOTOS} 張${failed.length ? `（無法讀取 ${failed.length} 張）` : ''}`);

    const captions = library.sourceIndices.map((i) => input.captions[i] ?? '');
    const portraitIndex = Math.max(0, library.sourceIndices.indexOf(input.portraitIndex));
    const seed = hashString([input.name, ...input.keywords, String(library.count)].join('|'));
    const sequence = buildSequence({ photoCount: library.count, lengthMode: input.durationMode, musicDuration });
    if (musicDuration !== null && Math.abs(musicDuration - sequence.total) > 0.5) {
      warnings.push(`音樂長度 ${Math.round(musicDuration)} 秒不在 30–300 秒之間，影片長度調整為 ${sequence.total} 秒`);
    }
    // Synthesis runs alongside the photo work below (review Important #2).
    const soundtrackPromise = buildSoundtrack({ style: input.musicStyle, file: input.music }, sequence.total, seed);
    soundtrackPromise.catch(() => undefined);
    const gallery = computeGallery({ sequence, aspects: library.aspects, portraitIndex, seed });

    onStatus('準備展示用的高解析照片…');
    await loadHires(library, input.photos, gallery.featured, pool);

    onStatus('計算馬賽克…');
    const colors = await pool.grid(input.photos[library.sourceIndices[portraitIndex]], CARPET.cols, CARPET.rows);
    const assignment = await pool.mosaic(colors, new Float32Array(library.colors.flat()), seed);

    onStatus('繪製 LED 字牆…');
    const { cols, rows, dot, phases, highlight: hl } = LED_V4;
    const ledTexture = async (lines: string[]) => bitmapToTexture(await pool.led(rasterizeLines(lines, cols, rows), cols, rows, dot));
    const small = await ledTexture(ledLines(words, phases.small.rows, phases.small.units));
    const large = await ledTexture(ledLines(words, phases.large.rows, phases.large.units));
    const full = await ledTexture(ledLines(words.slice(0, 1), phases.full.rows, phases.full.units));
    const highlight = bitmapToTexture(await pool.led(rasterizeHighlight(words[0] ?? input.name, hl.cols, hl.rows), hl.cols, hl.rows, dot));
    cleanup.push(() => {
      for (const t of [small, large, full, highlight]) t.dispose();
    });

    onStatus('布置展廳…');
    const world = buildGalleryWorld(sequence, gallery, {
      library,
      name: input.name,
      subtitle: input.subtitle,
      stamp: formatExhibitionStamp(exhibitionDate(input.date, new Date())),
      dateLabel: formatDisplayDate(input.date),
      captions,
      led: { small, large, full, highlight },
      mosaic: { colors, assignment },
    }, createCanvasTextureFactory());
    cleanup.push(() => world.dispose());
    const camera = buildGalleryPath(sequence, gallery);

    onStatus('合成配樂…');
    const soundtrack = await soundtrackPromise;
    if (soundtrack.warning) warnings.push(soundtrack.warning);

    return {
      input, sequence, gallery, world, camera, soundtrack: soundtrack.buffer, warnings,
      dispose() {
        cleanup.reverse().forEach((f) => f());
      },
    };
  } catch (err) {
    cleanup.reverse().forEach((f) => f());
    throw err;
  }
}
```

- [ ] **Step 3: Update `src/render/world-renderer.ts`**

Make these replacements:
- `import type { CameraPath } from '../camera/path';` → `import type { CameraPath } from '../camera/gallery-path';`
- `import { EXPOSURE, type World } from '../stage/world/world';` → `import { EXPOSURE, type GalleryWorld as World } from '../stage/gallery/world';`
- `import { worldFadeAt } from './world-fades';` → `import { aoIntensityFor, worldFadeAt } from './world-fades';`
- `    ao.configuration.intensity = glow > 0.6 ? 1.0 : 2.2;` → `    ao.configuration.intensity = aoIntensityFor(glow);`

- [ ] **Step 4: Delete the v3 strip, world and path**

```bash
git rm -r -q src/stage/strip.ts src/stage/world src/camera/path.ts \
  tests/unit/strip.test.ts tests/unit/path.test.ts tests/unit/world-rooms.test.ts tests/unit/world-dark.test.ts tests/unit/world-finale.test.ts tests/unit/fake-world.ts
```

Run: `npx tsc --noEmit && (grep -rn "stage/strip\|stage/world/\|camera/path'" src tests || echo clean)`
Expected: type check clean, and the grep prints `clean`.

- [ ] **Step 5: Replace `tests/e2e/acceptance.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PHOTOS, fillSetup } from './helpers';

/** 20 photos: the auto timeline then matches the original's seconds (photos segment 15 s). */
const TWENTY = [...DEFAULT_PHOTOS, ...DEFAULT_PHOTOS, ...DEFAULT_PHOTOS, ...DEFAULT_PHOTOS];
const original = process.env.ORIGINAL;
const results = path.resolve('test-results');

test.describe('comparison with the original film', () => {
  test.skip(!original, 'set ORIGINAL=/path/to/the/original.mp4 to run the comparison');

  test('side by side every 2 s from 0 to 148 s', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const out = path.join(results, 'compare');
    mkdirSync(out, { recursive: true });
    await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p', photos: TWENTY });
    const times = Array.from({ length: 75 }, (_, i) => i * 2);
    for (const [k, t] of times.entries()) {
      await page.locator('#scrub').fill(String(t));
      await page.locator('#viewport canvas').screenshot({ path: `${out}/ours-${k}.png` });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', original!, '-frames:v', '1', '-vf', 'scale=480:-2', `${out}/orig-${k}.png`]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/orig-${k}.png`, '-i', `${out}/ours-${k}.png`, '-filter_complex', `[0]pad=480:ih,drawtext=text='${t}s':x=6:y=6:fontsize=20:fontcolor=red[a];[1]scale=480:-2[b];[a][b]vstack`, `${out}/pair-${k}.png`]);
    }
    for (let s = 0; s < 5; s++) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-start_number', String(s * 15), '-i', `${out}/pair-%d.png`, '-frames:v', '1', '-vf', 'tile=5x3:padding=6:color=red', path.join(results, `compare-${s + 1}.png`)]);
    }
    expect(existsSync(path.join(results, 'compare-5.png'))).toBe(true);
  });

  test('motion matches the original section by section', async ({ page }) => {
    test.setTimeout(60 * 60_000);
    await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p', photos: TWENTY });
    const download = page.waitForEvent('download', { timeout: 59 * 60_000 });
    await page.click('#export');
    const ours = path.join(results, 'ours.mp4');
    await (await download).saveAs(ours);
    const csv = (name: string) => path.join(results, `${name}-motion.csv`);
    execFileSync('python3', ['scripts/measure-motion.py', original!, csv('original'), '--end', '151']);
    execFileSync('python3', ['scripts/measure-motion.py', ours, csv('ours'), '--end', '151']);
    const report = path.join(results, 'motion.md');
    const run = spawnSync('python3', ['scripts/compare-motion.py', csv('original'), csv('ours'), 'scripts/original-motion.json', report]);
    expect(run.status, readFileSync(report, 'utf8')).toBe(0);
  });
});
```

- [ ] **Step 6: Add the `motion` script and update the README**

In `package.json` `scripts`, after `"compare"`, add:
```json
    "motion": "playwright test tests/e2e/acceptance.spec.ts -g motion"
```


Replace the paragraph under `## 分鏡（依原作順序）` that starts with `一鏡到底，依原作逐格分析重建` with:
```markdown
一鏡到底，鏡頭軌跡依原作逐秒量測（光流與標示牌尺寸）重建：
- 開場從右前方斜看白牆，一邊轉正一邊推近；展名時完全平行並位於正中。
- 標題 → 展名 → 說明文字之後，鏡頭擦過白色厚隔牆，進入 Friends 與 Photos。兩者在同一面牆上；鏡頭在 Photos 後段逐步拉遠並升高，讓整面照片牆入鏡。
- 深色隔柱擦過後進入淺房 Location，再直線走近凹室中的 Words LED 字牆。字牆每一行跑馬燈與上一行方向相反，字的放大與 COM 滿版是螢幕本身的內容切換。
- 向右轉進入暗色大廳，繞著讚手勢旋轉：Likes 的古早映像管電視、會動態換照片的網格照片牆（Photos 5.2）、Videos 影像牆。之後沿影像牆橫移。
- 深色門板擦過後，直線走向機器手臂房的平台。
- 下降掠過照片地毯 → 地毯浮起成馬賽克肖像 → 網絡中心與星座 → 片尾卡片。

全片 2.35:1 黑邊、sRGB 調色與景深。`npm run compare`（需設定 `ORIGINAL=原作影片路徑`）會輸出每 2 秒一組的並排截圖（`test-results/compare-1…5.png`），以及逐段鏡頭運動比較表（`test-results/motion.md`）。
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run build && npx playwright test`
Expected: all pass.
- `export.spec.ts` still gives a 900-frame H.264 + AAC 30 s MP4.
- `preview.spec.ts` passes the brightness and one-take checks.
- `acceptance.spec.ts` is skipped without `ORIGINAL`.
- If a brightness threshold fails, change only materials, lights or `BLOOM`, never the threshold.
- If the one-take check fails, its message lists the time. Look at the track and the room visibility at that moment.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(v4): switch to the measured gallery track and retire the v3 strip"
```

---

### Task 11: Tune against the original

**Files:**
- Modify (constants only, each change ledgered): `src/camera/track.ts` (`TRACK`), `src/stage/gallery.ts` (`TEXT`, `HALL`, `ROBOTS`, `LABEL_Y`, placements), `src/stage/gallery/world.ts` (`EXPOSURE`, `BLOOM`), `src/stage/parts/led.ts` (`LED_V4.scroll`), `src/stage/parts/materials.ts` (colours).

**Interfaces:**
- Consumes: everything.
- Produces:
  - `test-results/compare-1…5.png`: 75 pairs, the original on top and ours below.
  - `test-results/motion.md`: all sections pass.

- [ ] **Step 1: Generate the comparison**

Run: `ORIGINAL="/home/sam/Downloads/Intel Museum of Me_720p.mp4" npm run compare`
Expected: both tests run. The motion test may fail at first; its message is the report.

- [ ] **Step 2: Tune, section by section**

Work through `test-results/motion.md` and the five sheets in order of time. For each pair, compare:
- the camera's distance to the wall: the size of labels and photos;
- the camera height: where the floor line sits;
- how far the view has turned: which walls are in frame;
- where the three wipes fall;
- the size and brightness of the text, LED rows, TVs, grid and Videos wall.

Fix a difference only by changing a constant listed under **Files**. Values marked 「（估）」 in the spec come first:
- wall height;
- white block thickness;
- LED wall size;
- scroll speed;
- the grid swap interval.

After each change, run: `npx vitest run && npx playwright test tests/e2e/preview.spec.ts && ORIGINAL="/home/sam/Downloads/Intel Museum of Me_720p.mp4" npm run compare`. Keep everything passing. Ledger every change as a `Task 11: Ruling:` line with before → after and the frame that motivated it.

- [ ] **Step 3: Final verification and commit**

Run: `npm test && npm run typecheck && npm run build && npx playwright test && ORIGINAL="/home/sam/Downloads/Intel Museum of Me_720p.mp4" npm run compare`
Expected: all pass, including the motion comparison.

```bash
git add -A
git commit -m "test(v4): tune the gallery against the original film"
```
