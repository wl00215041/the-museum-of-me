# Photo Scene Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the form page, the user drags photos into seven scene areas (defaults filled in automatically), and every gallery room uses the photos and order assigned to its scene.

**Architecture:** A pure module `src/plan/scenes.ts` defines the scenes, their capacities, the default choice and the resolution rules; the form (`src/ui/scene-board.ts`, mounted by `setup-form.ts`) edits scene lists of photo ids and submits them as photo indices; `project.ts` maps them through unreadable files to library indices; `computeGallery` takes them instead of choosing photos itself.

**Tech Stack:** TypeScript 5.9, Vite 8, Vitest 5, Playwright 1.63 (system Chrome), HTML5 drag and drop.

**Spec:** `docs/superpowers/specs/2026-09-28-scene-assignment-design.md` (with `2026-09-28-museum-of-me-v4-design.md` for everything else).

## Global Constraints

- UI text in Traditional Chinese.
- Photos never leave the browser.
- `renderFrame(t)` stays a pure function of t; default choices are deterministic (seeded `mulberry32`).
- Scene ids and capacities (spec §3): `friends` 12, `photos` 160, `location` 3, `tvs` 7, `grid` 60, `videos` 1, `floaters` 260.
- The mosaic carpet and the network always use all photos; the portrait is still chosen with 設為主視覺.
- Scene thumbnails use the class `scene-tile` (the existing tests count `.photo-tile`).

## Review Focus

1. Unreadable files in the upload: scene indices must follow the right photos after the library drops them → Task 3 e2e "maps scene photos through unreadable files".
2. Reordering the library after editing a scene keeps that scene's photos and order → Task 4 e2e "reordering the library keeps an edited scene as it is".
3. Deleting a photo removes it from every scene; an edited scene that loses its only photo shows the "filled automatically" note (an unedited one refills with the default) → Task 4 e2e "deleting a photo removes it from every scene".
4. Large archives (500 photos): defaults never exceed a capacity → Task 1 unit "defaults respect every capacity for 500 photos".
5. Music-length mode (length unknown on the form): no scene is greyed out → Task 4 e2e "music length mode greys out nothing".

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/types.ts` | `SceneId`, `SCENE_IDS`, `Scenes`, `ProjectInput.scenes?` |
| `src/plan/scenes.ts` | `SCENES`, `defaultScenes`, `resolveScenes`, `scenesInCut` |
| `src/stage/gallery.ts` | Rooms read their photos from the resolved scenes |
| `src/app/project.ts` | Maps submitted indices to library indices |
| `src/ui/scene-board.ts` | The right-hand scene areas (drag, drop, remove, reorder, capacity, grey-out, reset) and `scenesToIndices` |
| `src/ui/setup-form.ts`, `index.html`, `src/ui/styles.css` | Two-column layout; wiring the board to the library |
| `tests/unit/scenes.test.ts`, `tests/unit/gallery.test.ts`, `tests/unit/scene-board.test.ts`, `tests/e2e/scene-project.spec.ts`, `tests/e2e/scene-board.spec.ts` | Tests |

---

### Task 1: Scene model

**Files:**
- Modify: `src/types.ts`
- Create: `src/plan/scenes.ts`
- Test: `tests/unit/scenes.test.ts`

**Interfaces:**
- Consumes: `pickSpread`, `shuffle` (`src/stage/placement.ts`), `mulberry32` (`src/util/rng.ts`), `Sequence`, `SegmentId`.
- Produces:
  - `type SceneId = 'friends' | 'photos' | 'location' | 'tvs' | 'grid' | 'videos' | 'floaters'`, `SCENE_IDS: readonly SceneId[]`, `type Scenes = Record<SceneId, number[]>`, `ProjectInput.scenes?: Partial<Scenes>`.
  - `SCENES: Record<SceneId, { name: string; capacity: number; segment: SegmentId }>`.
  - `defaultScenes(n: number, seed: number): Scenes`.
  - `resolveScenes(scenes: Partial<Scenes> | undefined, n: number, seed: number): Scenes`.
  - `scenesInCut(sequence: Sequence): Set<SceneId>`.

- [ ] **Step 1: Write the failing test `tests/unit/scenes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildSequence } from '../../src/plan/sequence';
import { SCENES, defaultScenes, resolveScenes, scenesInCut } from '../../src/plan/scenes';
import { SCENE_IDS } from '../../src/types';

describe('scenes', () => {
  it('defaults: the same automatic choice as the gallery, within each capacity', () => {
    const d = defaultScenes(20, 7);
    expect(d.friends).toHaveLength(12);
    expect(d.photos).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(d.location).toHaveLength(3);
    expect(d.videos).toEqual([12]);
    expect(d.grid).toHaveLength(20);
    expect(d.floaters).toHaveLength(20);
    expect(new Set(d.tvs).size).toBe(d.tvs.length);
    expect(defaultScenes(20, 7)).toEqual(d);
  });

  it('defaults respect every capacity for 500 photos', () => {
    const d = defaultScenes(500, 3);
    for (const id of SCENE_IDS) {
      expect(d[id].length, id).toBeLessThanOrEqual(SCENES[id].capacity);
      expect(d[id].length, id).toBeGreaterThan(0);
      for (const i of d[id]) expect(i >= 0 && i < 500).toBe(true);
    }
  });

  it('resolve: drops bad indices and duplicates, trims to capacity, and fills empty scenes with the default', () => {
    const r = resolveScenes({ location: [4, 4, -1, 99, 2.5, 7, 1, 0], videos: [], friends: [3] }, 10, 1);
    expect(r.location).toEqual([4, 7, 1]);
    expect(r.videos).toEqual(defaultScenes(10, 1).videos);
    expect(r.friends).toEqual([3]);
    expect(r.photos).toEqual(defaultScenes(10, 1).photos);
    expect(resolveScenes(undefined, 10, 1)).toEqual(defaultScenes(10, 1));
  });

  it('knows which scenes each length shows', () => {
    const cut = (mode: 30 | 60 | 90 | 'auto') => scenesInCut(buildSequence({ photoCount: 20, lengthMode: mode, musicDuration: null }));
    expect([...cut(30)].sort()).toEqual(['floaters', 'photos']);
    expect([...cut(60)].sort()).toEqual(['floaters', 'friends', 'photos']);
    expect(cut('auto').size).toBe(SCENE_IDS.length);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/scenes.test.ts`
Expected: FAIL (cannot find module `../../src/plan/scenes`).

- [ ] **Step 3: Add the scene types to `src/types.ts`**

In `interface ProjectInput`, after `music: File | null;` add:
```ts
  /** Photo indices (into `photos`) per scene, in scene order; empty or missing scenes use the default choice. */
  scenes?: Partial<Scenes>;
```
Append at the end of the file:
```ts
export type SceneId = 'friends' | 'photos' | 'location' | 'tvs' | 'grid' | 'videos' | 'floaters';

/** In film order. */
export const SCENE_IDS: readonly SceneId[] = ['friends', 'photos', 'location', 'tvs', 'grid', 'videos', 'floaters'];

export type Scenes = Record<SceneId, number[]>;
```

- [ ] **Step 4: Write `src/plan/scenes.ts`**

```ts
import { pickSpread, shuffle } from '../stage/placement';
import { SCENE_IDS, type SceneId, type Scenes, type SegmentId, type Sequence } from '../types';
import { mulberry32 } from '../util/rng';

/** The scenes a user can fill (spec §3), in film order. */
export const SCENES: Record<SceneId, { name: string; capacity: number; segment: SegmentId }> = {
  friends: { name: 'Friends 畫布', capacity: 12, segment: 'portraits' },
  photos: { name: 'Photos 照片牆', capacity: 160, segment: 'photos' },
  location: { name: 'Location 燈箱', capacity: 3, segment: 'moments' },
  tvs: { name: 'Likes 古早電視', capacity: 7, segment: 'likes' },
  grid: { name: 'Photos 5.2 網格牆', capacity: 60, segment: 'likes' },
  videos: { name: 'Videos 影像牆', capacity: 1, segment: 'likes' },
  floaters: { name: '機器手臂房漂浮照片', capacity: 260, segment: 'robots' },
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const unique = (xs: number[]) => [...new Set(xs)];

/** The automatic choice for n photos (what the gallery picked before scenes could be edited). */
export function defaultScenes(n: number, seed: number): Scenes {
  const rnd = mulberry32(seed ^ 0x5ce9e);
  const grid = shuffle(n, rnd);
  const floaters = shuffle(n, rnd);
  return {
    friends: pickSpread(n, Math.min(SCENES.friends.capacity, n)),
    photos: n <= SCENES.photos.capacity ? range(n) : pickSpread(n, SCENES.photos.capacity),
    location: pickSpread(n, Math.min(SCENES.location.capacity, n), 0.37),
    tvs: unique(Array.from({ length: SCENES.tvs.capacity }, (_, i) => (5 * i + 2) % n)),
    grid: grid.slice(0, Math.min(SCENES.grid.capacity, n)),
    videos: pickSpread(n, 1, 0.61),
    floaters: floaters.slice(0, Math.min(SCENES.floaters.capacity, n)),
  };
}

/** The user's lists cleaned up: valid, unique, within capacity; an empty scene falls back to the default. */
export function resolveScenes(scenes: Partial<Scenes> | undefined, n: number, seed: number): Scenes {
  const fallback = defaultScenes(n, seed);
  const out = {} as Scenes;
  for (const id of SCENE_IDS) {
    const seen = new Set<number>();
    const list: number[] = [];
    for (const i of scenes?.[id] ?? []) {
      if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) continue;
      seen.add(i);
      list.push(i);
      if (list.length === SCENES[id].capacity) break;
    }
    out[id] = list.length > 0 ? list : fallback[id];
  }
  return out;
}

/** Scenes that appear in a cut. */
export function scenesInCut(sequence: Sequence): Set<SceneId> {
  const present = new Set(sequence.segments.map((s) => s.id));
  return new Set(SCENE_IDS.filter((id) => present.has(SCENES[id].segment)));
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run tests/unit/scenes.test.ts && npx tsc --noEmit`
Expected: PASS (4 passed), type check clean.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/plan/scenes.ts tests/unit/scenes.test.ts
git commit -m "feat(scenes): scene model — capacities, default choice, resolution, scenes per cut"
```

---

### Task 2: Rooms use the assigned photos

**Files:**
- Modify: `src/stage/gallery.ts`
- Test: `tests/unit/gallery.test.ts`

**Interfaces:**
- Consumes: `resolveScenes` (Task 1), `Scenes`.
- Produces: `GalleryInput.scenes?: Partial<Scenes>` (photo indices into `aspects`). Each room uses the resolved scene list:
  - Friends takes the first `k` that fit;
  - the Photos wall hangs its list in order;
  - Location has one box per photo (1–3), centred;
  - TVs cycle the list;
  - the grid fills 30 cells in order and rotates only when the list is longer than 30;
  - Videos uses the first photo;
  - large floaters take the list from the start, small floaters cycle the rest.

- [ ] **Step 1: Write the failing tests (append inside `describe('computeGallery', …)` in `tests/unit/gallery.test.ts`)**

```ts
  it('hangs the photos assigned to each scene, in scene order', () => {
    const n = 20;
    const sequence = buildSequence({ photoCount: n, lengthMode: 'auto', musicDuration: null });
    const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
    const scenes = { friends: [5, 3, 9], photos: [0, 1, 2, 3, 4], location: [7, 2], tvs: [11, 12], grid: [4, 6, 8], videos: [13], floaters: [15, 16, 17, 18, 19, 14, 10, 1, 2] };
    const g = computeGallery({ sequence, aspects, portraitIndex: 1, seed: 7, scenes });
    expect(g.portraits!.items.map((i) => i.photoIndex)).toEqual([5, 3, 9]);
    expect(g.photos.items.map((i) => i.photoIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(g.location!.boxes.map((b) => b.photoIndex)).toEqual([7, 2]);
    const [a, b] = g.location!.boxes.map((x) => x.center[0]);
    expect(b).toBeGreaterThan(a);
    expect(g.hall!.crts.screens.map((s) => s.photoIndex)).toEqual([11, 12, 11, 12, 11, 12, 11]);
    expect(g.hall!.grid.cells.slice(0, 6).map((c) => c.photos[0])).toEqual([4, 6, 8, 4, 6, 8]);
    for (const c of g.hall!.grid.cells) expect(new Set(c.photos).size).toBe(1);
    expect(g.hall!.videos.photoIndex).toBe(13);
    const large = g.robots.floaters.filter((f) => f.size >= 0.8).map((f) => f.photoIndex);
    expect(large.length).toBeGreaterThan(0);
    for (const i of large) expect([15, 16, 17, 18, 19, 14, 10]).toContain(i);
    for (const f of g.robots.floaters.filter((x) => x.size < 0.8)) expect([1, 2]).toContain(f.photoIndex);
    for (const i of [5, 3, 9, 7, 2, 13, ...large]) expect(g.featured).toContain(i);
  });

  it('rotates grid photos beyond the first 30 into the grid over time', () => {
    const n = 60;
    const sequence = buildSequence({ photoCount: n, lengthMode: 'auto', musicDuration: null });
    const aspects = Array.from({ length: n }, () => 1.5);
    const grid = Array.from({ length: 40 }, (_, i) => 59 - i);
    const g = computeGallery({ sequence, aspects, portraitIndex: 0, seed: 7, scenes: { grid } });
    const cells = g.hall!.grid.cells;
    expect(cells.map((c) => c.photos[0])).toEqual(grid.slice(0, 30));
    const later = new Set(cells.flatMap((c) => c.photos));
    expect([...later].some((p) => grid.slice(30).includes(p))).toBe(true);
    for (const p of later) expect(grid).toContain(p);
  });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/unit/gallery.test.ts`
Expected: FAIL. `scenes` is not in `GalleryInput` (a type error at `tsc`), and at run time the rooms ignore it: `expected [ …default… ] to deeply equal [ 5, 3, 9 ]`.

- [ ] **Step 3: Change `src/stage/gallery.ts`**

Imports:
- `import type { Segment, Sequence, Vec3 } from '../types';` → `import type { Scenes, Segment, Sequence, Vec3 } from '../types';`
- add `import { resolveScenes } from '../plan/scenes';`
- in the `./placement` import remove `shuffle` and `MAX_WALL_PHOTOS` (both unused afterwards), and `pickSpread` too if `tsc` reports it unused.

`GalleryInput`: after `seed: number;` add
```ts
  /** Photo indices per scene (spec: scene assignment); empty or missing scenes use the default choice. */
  scenes?: Partial<Scenes>;
```

In `computeGallery`, after `const rnd = mulberry32(input.seed);` add:
```ts
  const S = resolveScenes(input.scenes, n, input.seed);
```

Friends, replace
```ts
    const k = Math.min(12, n, Math.max(1, Math.floor((xb - xa) / 1.7) + 1));
    const indices = pickSpread(n, k);
```
with
```ts
    // The assigned photos, as many as the wall has room for.
    const indices = S.friends.slice(0, Math.max(1, Math.floor((xb - xa) / 1.7) + 1));
    const k = indices.length;
```

Photos wall, replace
```ts
  const wallPhotos = n <= MAX_WALL_PHOTOS ? Array.from({ length: n }, (_, i) => i) : pickSpread(n, MAX_WALL_PHOTOS);
```
with
```ts
  const wallPhotos = S.photos;
```
and replace the `items:` expression (both branches) with
```ts
    items: photoSwarm(wallPhotos.map((i) => aspects[i]), swarmA, swarmB, rnd, WALL_HEIGHT.white, 0, [1.5, 5.3], [0.8, 2.2]).map((item) => ({ ...item, photoIndex: wallPhotos[item.photoIndex] })),
```

Location, replace
```ts
      const indices = n >= 3 ? pickSpread(n, 3, 0.37) : [0, 1, 2].map((i) => i % n);
```
with
```ts
      const indices = S.location;
```
and in the `boxes:` line replace `center: [mid + (i - 1) * spacing, 1.65, 0]` with `center: [mid + (i - (indices.length - 1) / 2) * spacing, 1.65, 0]`.

TVs: in the `screens` line replace `photoIndex: (i * 5 + 2) % n` with `photoIndex: S.tvs[i % S.tvs.length]`.

Grid, replace
```ts
    const pool = shuffle(n, rnd);
```
with
```ts
    // The assigned photos fill the 30 cells in order; only photos beyond the 30th rotate in (spec §3).
    const pool = S.grid;
    const rotates = pool.length > G.cols * G.rows;
```
in the cell push replace `photos: [pool[(r * G.cols + c) % n]]` with `photos: [pool[(r * G.cols + c) % pool.length]]`, and in the swap loop replace
```ts
      cells.forEach((cell, i) => cell.photos.push(changed.has(i) ? pool[next++ % n] : cell.photos[k - 1]));
```
with
```ts
      cells.forEach((cell, i) => cell.photos.push(rotates && changed.has(i) ? pool[next++ % pool.length] : cell.photos[k - 1]));
```

Videos: replace `photoIndex: pickSpread(n, 1, 0.61)[0]` with `photoIndex: S.videos[0]`.

Floaters: before `const floaters: Gallery['robots']['floaters'] = [];` add
```ts
  // The assigned list: its first ROBOTS.large photos are the large ones by the camera, the rest float around the room.
  const F = S.floaters;
  const smallPool = F.length > ROBOTS.large ? F.slice(ROBOTS.large) : F;
  let smallNext = 0;
  let largeNext = 0;
```
in the small-floater push replace `photoIndex: Math.floor(rnd() * n)` with `photoIndex: smallPool[smallNext++ % smallPool.length]`, and in the large-floater push replace `photoIndex: Math.floor(rnd() * n)` with `photoIndex: F[largeNext++ % F.length]`.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run && npx tsc --noEmit`
Expected: the whole suite passes (gallery tests include the two new ones), type check clean.
- If an older test fails because the default Friends selection or grid rotation changed, it is testing the old automatic choice. Update it to the default from `defaultScenes` and ledger the ruling.

- [ ] **Step 5: Commit**

```bash
git add src/stage/gallery.ts tests/unit/gallery.test.ts
git commit -m "feat(scenes): gallery rooms use the photos assigned to their scene"
```

---

### Task 3: Project maps scene indices to the library

**Files:**
- Modify: `src/app/project.ts`
- Test: `tests/e2e/scene-project.spec.ts`

**Interfaces:**
- Consumes: `ProjectInput.scenes` (Task 1), `GalleryInput.scenes` (Task 2), `library.sourceIndices` (library index → input index).
- Produces: `Project.gallery` built with the user's scenes, mapped to library indices; indices of unreadable files are dropped.

- [ ] **Step 1: Write the failing test `tests/e2e/scene-project.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;
const NAMES = ['photo-1.jpg', 'not-an-image.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg'];

test('maps scene photos through unreadable files', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto('/');
  await loadModule(page, '/src/app/project.ts', '__project');
  await loadModule(page, '/src/assets/photo-pool.ts', '__pool');
  const r = await page.evaluate(async (data) => {
    const w = window as AnyWindow;
    const files = data.map(([name, bytes]) => new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' }));
    const pool = w.__pool.createPhotoPool(2);
    const project = await w.__project.buildProject({
      photos: files, captions: files.map(() => ''), portraitIndex: 0, name: 'Tim', subtitle: '', date: '', keywords: [],
      durationMode: 'auto', resolution: '720p', musicStyle: 'calm', music: null,
      // Input indices: 4 = photo-4, 1 = the unreadable file, 2 = photo-2.
      scenes: { location: [4, 1, 2], videos: [3] },
    }, pool, () => {});
    const out = { location: project.gallery.location.boxes.map((b: { photoIndex: number }) => b.photoIndex), video: project.gallery.hall.videos.photoIndex };
    project.dispose();
    pool.dispose();
    return out;
  }, NAMES.map((n) => [n, b64(n)] as [string, string]));
  // The library holds photo-1, photo-2, photo-3, photo-4 at 0–3.
  expect(r.location).toEqual([3, 1]);
  expect(r.video).toBe(2);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test tests/e2e/scene-project.spec.ts`
Expected: FAIL. `project.ts` ignores `scenes`, so the default choice appears (`expected [ … ] to equal [ 3, 1 ]`).

- [ ] **Step 3: Change `src/app/project.ts`**

Imports:
- `import type { ProjectInput, Sequence } from '../types';` → `import { SCENE_IDS, type ProjectInput, type Scenes, type Sequence } from '../types';`

Replace
```ts
    const gallery = computeGallery({ sequence, aspects: library.aspects, portraitIndex, seed });
```
with
```ts
    // Scene lists name input photos; the library skipped unreadable files, so map through sourceIndices.
    const scenes: Partial<Scenes> | undefined = input.scenes
      ? Object.fromEntries(SCENE_IDS.map((id) => [id, (input.scenes?.[id] ?? []).map((i) => library.sourceIndices.indexOf(i)).filter((i) => i >= 0)]))
      : undefined;
    const gallery = computeGallery({ sequence, aspects: library.aspects, portraitIndex, seed, scenes });
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx playwright test tests/e2e/scene-project.spec.ts && npx tsc --noEmit`
Expected: PASS (1 passed), type check clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/project.ts tests/e2e/scene-project.spec.ts
git commit -m "feat(scenes): project maps scene photos to the library, skipping unreadable files"
```

---

### Task 4: The scene board on the form

**Files:**
- Create: `src/ui/scene-board.ts`
- Modify: `index.html` (the photos fieldset), `src/ui/styles.css`, `src/ui/setup-form.ts`, `README.md`
- Test: `tests/unit/scene-board.test.ts`, `tests/e2e/scene-board.spec.ts`

**Interfaces:**
- Consumes: `SCENES`, `defaultScenes`, `scenesInCut` (Task 1); `buildSequence`; `ProjectInput.scenes` (Task 1).
- Produces:
  - `scenesToIndices(order: number[], scenes: Record<SceneId, number[]>): Partial<Scenes>`: photo ids → indices in `order`, dropping unknown ids.
  - `interface SceneBoard { setPhotos(ids: number[]): void; setAvailable(ids: Set<SceneId> | null): void; value(): Record<SceneId, number[]>; repaint(id: number): void }`.
  - `mountSceneBoard(root: HTMLElement, o: { draw(id: number, canvas: HTMLCanvasElement): void; dragged(): number | null; name(id: number): string }): SceneBoard`.
  - DOM:
    - `section.scene[data-scene=<id>]` with `.count`, `.scene-tiles > li.scene-tile[data-id][title=<file name>]`, `button.remove`, `.empty`, `.note`, `.scene-msg`;
    - class `unavailable` on scenes that don't appear at the chosen length;
    - `button#scene-reset`.

- [ ] **Step 1: Write the failing unit test `tests/unit/scene-board.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { scenesToIndices } from '../../src/ui/scene-board';

describe('scenesToIndices', () => {
  it('turns photo ids into indices of the current order and drops unknown ids', () => {
    const order = [40, 10, 30, 20];
    const r = scenesToIndices(order, { friends: [30, 40], photos: [10, 99], location: [], tvs: [20], grid: [], videos: [30], floaters: [20, 10] });
    expect(r).toEqual({ friends: [2, 0], photos: [1], location: [], tvs: [3], grid: [], videos: [2], floaters: [3, 1] });
  });
});
```

- [ ] **Step 2: Write the failing e2e test `tests/e2e/scene-board.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PHOTOS, fixture } from './helpers';

const scene = (page: Page, id: string) => page.locator(`.scene[data-scene="${id}"]`);
const names = (page: Page, id: string) => scene(page, id).locator('.scene-tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).title));
const libraryTile = (page: Page, name: string) => page.locator(`.photo-tile[title="${name}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', DEFAULT_PHOTOS.map(fixture));
  await expect(page.locator('.photo-tile')).toHaveCount(5);
});

test('fills every scene with the default choice after upload', async ({ page }) => {
  await expect(scene(page, 'photos').locator('.scene-tile')).toHaveCount(5);
  await expect(scene(page, 'friends').locator('.count')).toHaveText('5 / 12');
  expect(await names(page, 'location')).toEqual(['photo-1.jpg', 'photo-3.jpg', 'photo-4.jpg']);
  await expect(scene(page, 'videos').locator('.count')).toHaveText('1 / 1');
});

test('drag adds, × removes, a full scene refuses, dragging inside a scene reorders', async ({ page }) => {
  const location = scene(page, 'location');
  await location.locator('.scene-tile[title="photo-1.jpg"] .remove').click();
  expect(await names(page, 'location')).toEqual(['photo-3.jpg', 'photo-4.jpg']);
  await libraryTile(page, 'photo-5.jpg').dragTo(location);
  expect(await names(page, 'location')).toEqual(['photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
  await libraryTile(page, 'photo-2.jpg').dragTo(location);
  await expect(location.locator('.scene-msg')).toHaveText('已達上限 3 張');
  expect(await names(page, 'location')).toEqual(['photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
  await location.locator('.scene-tile[title="photo-5.jpg"]').dragTo(location.locator('.scene-tile[title="photo-3.jpg"]'));
  expect(await names(page, 'location')).toEqual(['photo-5.jpg', 'photo-3.jpg', 'photo-4.jpg']);
});

test('a photo can be in several scenes but not twice in one', async ({ page }) => {
  await libraryTile(page, 'photo-1.jpg').dragTo(scene(page, 'friends'));
  await expect(scene(page, 'friends').locator('.scene-tile')).toHaveCount(5);
  await expect(page.locator('.scene-tile[title="photo-1.jpg"]')).not.toHaveCount(0);
  expect((await names(page, 'photos')).includes('photo-1.jpg') && (await names(page, 'friends')).includes('photo-1.jpg')).toBe(true);
});

test('deleting a photo removes it from every scene', async ({ page }) => {
  const video = (await names(page, 'videos'))[0];
  await libraryTile(page, video).click();
  await page.click('#detail-remove');
  await expect(page.locator(`.scene-tile[title="${video}"]`)).toHaveCount(0);
  await expect(page.locator('.photo-tile')).toHaveCount(4);
  // An edited scene that loses its only photo stays empty and says so.
  const videos = scene(page, 'videos');
  await videos.locator('.remove').click();
  await libraryTile(page, 'photo-2.jpg').dragTo(videos);
  expect(await names(page, 'videos')).toEqual(['photo-2.jpg']);
  await libraryTile(page, 'photo-2.jpg').click();
  await page.click('#detail-remove');
  await expect(videos.locator('.scene-tile')).toHaveCount(0);
  await expect(videos.locator('.empty')).toHaveText('空：產生影片時自動補上');
});

test('reordering the library keeps an edited scene as it is', async ({ page }) => {
  await scene(page, 'location').locator('.scene-tile[title="photo-1.jpg"] .remove').click();
  const before = await names(page, 'location');
  await libraryTile(page, 'photo-2.jpg').click();
  await page.click('#detail-right');
  expect(await names(page, 'location')).toEqual(before);
});

test('an emptied scene says it will be filled automatically; restore defaults refills it', async ({ page }) => {
  await scene(page, 'videos').locator('.remove').click();
  await expect(scene(page, 'videos').locator('.empty')).toHaveText('空：產生影片時自動補上');
  await page.click('#scene-reset');
  await expect(scene(page, 'videos').locator('.scene-tile')).toHaveCount(1);
});

test('scenes not in the chosen length are greyed out', async ({ page }) => {
  await page.selectOption('#duration', '30');
  for (const id of ['friends', 'location', 'tvs', 'grid', 'videos']) {
    await expect(scene(page, id)).toHaveClass(/unavailable/);
    await expect(scene(page, id).locator('.note')).toHaveText('此長度不會出現');
  }
  for (const id of ['photos', 'floaters']) await expect(scene(page, id)).not.toHaveClass(/unavailable/);
  await page.selectOption('#duration', 'auto');
  await expect(page.locator('.scene.unavailable')).toHaveCount(0);
});

test('music length mode greys out nothing', async ({ page }) => {
  await page.selectOption('#music-style', 'upload');
  await page.setInputFiles('#music', fixture('tone-5s.wav'));
  await page.selectOption('#duration', 'music');
  await expect(page.locator('.scene.unavailable')).toHaveCount(0);
});
```

- [ ] **Step 3: Run both and confirm they fail**

Run: `npx vitest run tests/unit/scene-board.test.ts; npx playwright test tests/e2e/scene-board.spec.ts`
Expected:
- unit: FAIL (cannot find module `../../src/ui/scene-board`);
- e2e: every test FAILs waiting for `.scene[data-scene=…]`.

- [ ] **Step 4: Write `src/ui/scene-board.ts`**

```ts
import { SCENES, defaultScenes } from '../plan/scenes';
import { SCENE_IDS, type SceneId, type Scenes } from '../types';

/** The form's default choice is independent of the name, so the board does not reshuffle while typing. */
const FORM_SEED = 1;
/** Scenes that take newly added photos after the user has edited them (spec §4.1). */
const GROWING: readonly SceneId[] = ['photos', 'grid', 'floaters'];

export interface SceneBoard {
  /** The library changed (photos added, removed or reordered); ids in library order. */
  setPhotos(ids: number[]): void;
  /** Scenes the chosen length shows; null when unknown (music length). */
  setAvailable(ids: Set<SceneId> | null): void;
  /** Photo ids per scene, in scene order. */
  value(): Record<SceneId, number[]>;
  /** A photo's preview arrived: redraw its scene thumbnails. */
  repaint(id: number): void;
}

/** Photo ids → indices of `order` (the submitted photo order), dropping ids no longer in the library. */
export function scenesToIndices(order: number[], scenes: Record<SceneId, number[]>): Partial<Scenes> {
  const index = new Map(order.map((id, i) => [id, i]));
  return Object.fromEntries(SCENE_IDS.map((id) => [id, scenes[id].map((pid) => index.get(pid)).filter((i): i is number => i !== undefined)])) as Partial<Scenes>;
}

export function mountSceneBoard(
  root: HTMLElement,
  o: { draw(id: number, canvas: HTMLCanvasElement): void; dragged(): number | null; name(id: number): string },
): SceneBoard {
  let photos: number[] = [];
  let scenes = Object.fromEntries(SCENE_IDS.map((id) => [id, [] as number[]])) as Record<SceneId, number[]>;
  const edited = new Set<SceneId>();
  let available: Set<SceneId> | null = null;
  let sceneDrag: { scene: SceneId; id: number } | null = null;
  const messages = new Map<SceneId, string>();

  const defaults = (): Record<SceneId, number[]> => {
    const d = defaultScenes(Math.max(1, photos.length), FORM_SEED);
    return Object.fromEntries(SCENE_IDS.map((id) => [id, photos.length ? d[id].map((i) => photos[i]) : []])) as Record<SceneId, number[]>;
  };

  function add(scene: SceneId, id: number, before: number | null): void {
    const list = scenes[scene];
    if (list.includes(id)) return;
    if (list.length >= SCENES[scene].capacity) {
      messages.set(scene, `已達上限 ${SCENES[scene].capacity} 張`);
      render();
      return;
    }
    const at = before === null ? list.length : Math.max(0, list.indexOf(before));
    list.splice(at, 0, id);
    edited.add(scene);
    render();
  }

  function move(scene: SceneId, id: number, before: number | null): void {
    const list = scenes[scene];
    const from = list.indexOf(id);
    if (from < 0 || id === before) return;
    list.splice(from, 1);
    const at = before === null ? list.length : Math.max(0, list.indexOf(before));
    list.splice(at, 0, id);
    edited.add(scene);
    render();
  }

  function drop(scene: SceneId, before: number | null, ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    messages.delete(scene);
    if (sceneDrag) {
      if (sceneDrag.scene === scene) move(scene, sceneDrag.id, before);
      else add(scene, sceneDrag.id, before);
      sceneDrag = null;
      return;
    }
    const id = o.dragged();
    if (id !== null) add(scene, id, before);
  }

  function tile(scene: SceneId, id: number): HTMLLIElement {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '移出這個場景');
    remove.addEventListener('click', () => {
      scenes[scene] = scenes[scene].filter((x) => x !== id);
      edited.add(scene);
      messages.delete(scene);
      render();
    });
    const li = document.createElement('li');
    li.className = 'scene-tile';
    li.draggable = true;
    li.dataset.id = String(id);
    li.title = o.name(id);
    li.append(canvas, remove);
    li.addEventListener('dragstart', (ev) => {
      ev.stopPropagation();
      sceneDrag = { scene, id };
    });
    li.addEventListener('dragend', () => { sceneDrag = null; });
    li.addEventListener('dragover', (ev) => ev.preventDefault());
    li.addEventListener('drop', (ev) => drop(scene, id, ev));
    o.draw(id, canvas);
    return li;
  }

  function render(): void {
    const head = document.createElement('div');
    head.className = 'scene-board-head';
    const title = document.createElement('h3');
    title.textContent = '場景';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'scene-reset';
    reset.textContent = '恢復預設';
    reset.addEventListener('click', () => {
      edited.clear();
      messages.clear();
      scenes = defaults();
      render();
    });
    const hint = document.createElement('p');
    hint.className = 'scene-hint';
    hint.textContent = '把左側照片拖進場景即可加入；同一張照片可以放在多個場景。';
    head.append(title, reset);
    const sections = SCENE_IDS.map((id) => {
      const section = document.createElement('section');
      section.className = 'scene';
      section.dataset.scene = id;
      if (available && !available.has(id)) section.classList.add('unavailable');
      const h = document.createElement('h4');
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${scenes[id].length} / ${SCENES[id].capacity}`;
      h.append(SCENES[id].name, count);
      const list = document.createElement('ol');
      list.className = 'scene-tiles';
      list.append(...scenes[id].map((pid) => tile(id, pid)));
      section.append(h, list);
      if (available && !available.has(id)) section.append(Object.assign(document.createElement('p'), { className: 'note', textContent: '此長度不會出現' }));
      if (scenes[id].length === 0) section.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: '空：產生影片時自動補上' }));
      const msg = messages.get(id);
      if (msg) section.append(Object.assign(document.createElement('p'), { className: 'scene-msg', textContent: msg, role: 'status' }));
      section.addEventListener('dragover', (ev) => {
        if (o.dragged() !== null || sceneDrag) {
          ev.preventDefault();
          section.classList.add('over');
        }
      });
      section.addEventListener('dragleave', () => section.classList.remove('over'));
      section.addEventListener('drop', (ev) => {
        section.classList.remove('over');
        drop(id, null, ev);
      });
      return section;
    });
    root.replaceChildren(head, hint, ...sections);
  }

  return {
    setPhotos(ids) {
      if (ids.length === photos.length && ids.every((id, i) => id === photos[i])) return;
      const known = new Set(photos);
      const added = ids.filter((id) => !known.has(id));
      const kept = new Set(ids);
      photos = [...ids];
      const d = defaults();
      for (const id of SCENE_IDS) {
        if (!edited.has(id)) {
          scenes[id] = d[id];
          continue;
        }
        scenes[id] = scenes[id].filter((pid) => kept.has(pid));
        if (GROWING.includes(id)) for (const pid of added) if (scenes[id].length < SCENES[id].capacity) scenes[id].push(pid);
      }
      render();
    },
    setAvailable(ids) {
      available = ids;
      render();
    },
    value() {
      return Object.fromEntries(SCENE_IDS.map((id) => [id, [...scenes[id]]])) as Record<SceneId, number[]>;
    },
    repaint(id) {
      for (const canvas of root.querySelectorAll<HTMLCanvasElement>(`.scene-tile[data-id="${id}"] canvas`)) o.draw(id, canvas);
    },
  };
}
```

- [ ] **Step 5: Change `index.html`**

In the `1. 照片` fieldset, wrap everything from the `<label id="dropzone" …>` to the closing `</ol>` of `#photo-grid` in
```html
            <div class="photos-layout">
              <div class="library">
                <!-- the existing dropzone, input, notice, photo-detail, photo-count and photo-grid, unchanged -->
              </div>
              <section id="scene-board" class="scene-board" aria-label="場景"></section>
            </div>
```
and change the dropzone hint `<span>` text to `3–500 張；點選縮圖可編輯說明文字或設為主視覺，拖曳縮圖到右側場景可指定照片出現的地方`.

- [ ] **Step 6: Append the styles to `src/ui/styles.css`**

```css
.photos-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .photos-layout { grid-template-columns: 1fr; } }
.scene-board-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.scene-board-head h3 { margin: 0; font-size: 15px; }
.scene-hint { margin: 4px 0 10px; font-size: 13px; color: var(--muted); }
.scene { border: 1px dashed var(--line); padding: 8px; margin: 0 0 8px; }
.scene.over { border-style: solid; border-color: var(--ink); }
.scene.unavailable { opacity: 0.45; }
.scene h4 { margin: 0 0 6px; font-size: 13px; display: flex; justify-content: space-between; gap: 8px; }
.scene .count { font-weight: normal; color: var(--muted); font-variant-numeric: tabular-nums; }
.scene-tiles { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; min-height: 36px; }
.scene-tile { position: relative; width: 64px; aspect-ratio: 4 / 3; border: 1px solid var(--line); background: #efeee9; cursor: grab; }
.scene-tile canvas { width: 100%; height: 100%; display: block; }
.scene-tile .remove { position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; border-radius: 50%; border: 0; padding: 0; background: var(--ink); color: var(--paper); font-size: 12px; line-height: 18px; cursor: pointer; }
.scene .note, .scene .empty, .scene .scene-msg { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
.scene .scene-msg { color: #b3261e; }
```

- [ ] **Step 7: Wire the board into `src/ui/setup-form.ts`**

Imports, add:
```ts
import { buildSequence } from '../plan/sequence';
import { scenesInCut } from '../plan/scenes';
import { mountSceneBoard, scenesToIndices } from './scene-board';
```

After `const tileOf = …;` add:
```ts
  const board = mountSceneBoard(q<HTMLElement>('#scene-board'), {
    draw(id, canvas) {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      if (entry.preview) drawCover(canvas, entry.preview);
      else requestPreview(entry);
    },
    dragged: () => dragId,
    name: (id) => entries.find((e) => e.id === id)?.file.name ?? '',
  });
  const syncScenesToLength = () => {
    const mode = parseDuration(duration.value);
    board.setAvailable(mode === 'music' ? null : scenesInCut(buildSequence({ photoCount: Math.max(1, entries.length), lengthMode: mode, musicDuration: null })));
  };
```

In `paint(entry)`, append at the end of the function:
```ts
    if (entry.preview) board.repaint(entry.id);
```

In `render()`, before `renderDetail();`, add:
```ts
    board.setPhotos(entries.map((e) => e.id));
```

After `music.addEventListener('change', syncMusicLength);` add:
```ts
  duration.addEventListener('change', syncScenesToLength);
```
and in `syncMusicLength()`, as its last line, add `syncScenesToLength();` (it may reset the duration to auto).

In the `onSubmit({ … })` object, after `music: …,` add:
```ts
      scenes: scenesToIndices(entries.map((e) => e.id), board.value()),
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/scene-board.spec.ts tests/e2e/setup-form.spec.ts`
Expected: all pass. The existing setup-form tests are unaffected because scene thumbnails are `.scene-tile`, not `.photo-tile`.
- If `dragTo` from a library tile does not reach the scene, check that the scene's `dragover` calls `preventDefault` while `dragId` is set; the library tile sets `dragId` on `dragstart`.

- [ ] **Step 9: Update the README**

After the paragraph describing the photo grid in the README's usage section, add:
```markdown
- 表單右側的「場景」列出 Friends 畫布、Photos 照片牆、Location 燈箱、Likes 古早電視、Photos 5.2 網格牆、Videos 影像牆與機器手臂房漂浮照片。上傳後會自動分配，可把左側照片拖進任一場景（同一張可放在多個場景）、按 × 移出、在場景內拖曳排序；場景內的順序就是影片中的順序。馬賽克地毯與網絡一律使用全部照片。
```

- [ ] **Step 10: Full verification and commit**

Run: `npm test && npm run typecheck && npm run build && npx playwright test`
Expected: everything passes (the acceptance tests are skipped without `ORIGINAL`).

```bash
git add -A
git commit -m "feat(scenes): scene board on the form — drag photos into scenes, remove, reorder, capacity, grey-out, restore defaults"
```
