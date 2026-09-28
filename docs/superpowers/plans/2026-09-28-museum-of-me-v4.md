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
  it('is continuous in position, velocity and view direction up to the dive', () => {
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
  whiteBlock: { at: 0.16, width: 1.2, gap: 1.8 },
  darkPillar: { after: 1.0, gap: 1.6, width: 1.1 },
  dark: { wallZ: 5.2, eye: 1.5, dEnd: 7.2, speed: 1.2, wallEndPastCamera: 2.6 },
  words: {
    /** Distance to the LED wall by fraction of the segment (original 63–92 s, from the zoom track). */
    d: [[0, 10.9], [0.1, 10.5], [0.24, 9.0], [0.41, 7.4], [0.59, 6.4], [0.76, 4.7], [0.86, 3.6], [0.97, 2.8], [1, 2.7]],
    /** Sideways speed in m/s at the original pace, by fraction. */
    drift: [[0, 1.1], [0.1, 0.45], [0.24, 0.35], [0.3, 0.15], [0.76, 0.13], [0.86, 0.45], [1, 0.6]],
    ledWidth: 10,
    ledHeight: 3.4,
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
  door: { gap: 1.3, width: 1.8 },
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
        return { pos: [x0 + x.at(t), lerp(pe.pos[1], TRACK.dark.eye, smoothstep(m.start, at(m, 0.4), t)), zz], yaw: 0, focus: zz - TRACK.dark.wallZ };
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
          focus: d,
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
      return { pos: toWorld(robotsFrame, local), yaw: yawR, focus: local[2] - platformZ };
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
