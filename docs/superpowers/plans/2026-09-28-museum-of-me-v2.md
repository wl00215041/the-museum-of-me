# The Museum of Me v2（還原原作）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依原作分鏡重做美術館影片：共 13 個分鏡，白牆開場運鏡採等速平移、偏航角逐漸歸零；加上 2.35:1 黑邊與調色、暗房泛光，新增空靈鋼琴配樂與「配合音樂長度」；照片上限提高到 500 張，並以 Worker 池處理解碼與重運算。

**Architecture:**
- 時間 → 畫面仍然是純函式：`plan/storyboard`（分鏡時長）→ `stage/layout`（各布景配置，純資料）→ `camera/shots`（分鏡式鏡頭）與 `stage/sets/*`（每個布景一個 `THREE.Scene`）→ `render/stage-renderer`（依時間切換布景，套用轉場、泛光與調色）。
- 照片先由 `assets/photo-pool` 的 Worker 解碼成 256 px 縮圖並打包成圖集，只有被放大展示的照片才另外解碼成 1600 px 高解析版。
- v2 模組以新檔名建立，與 v1 並存；Task 13 再切換過去並刪除 v1 模組，確保每個 Task 結束時測試都是綠的。

**Tech Stack:** 同 v1（Vite 8、TypeScript 5.9、three 0.186、postprocessing 6.39、n8ao 2.0.1、mediabunny 1.60、Vitest 5、Playwright 1.63 + Google Chrome），另外使用模組 Worker 與 OffscreenCanvas。

**Spec:** `docs/superpowers/specs/2026-09-28-museum-of-me-v2-design.md`（未被取代的部分沿用 `docs/superpowers/specs/2026-09-28-museum-of-me-design.md`）

## Global Constraints

- 分鏡順序與 id：`title, intro, exhibition, portraits, photos, moments, words, likes, videos, robots, mosaic, network, ending`。
- 基準時長（秒）：title 6、intro 5、exhibition 7、portraits 8、photos `min(30, 10 + 0.4·N)`、moments 12、words 14、likes 9、videos 9、robots 22、mosaic 10、network 16、ending 7。
- 固定長度的組合：30 s = `title, exhibition, photos, mosaic, ending`；60 s 再加 `intro, portraits, words, network`；90 s 再加 `moments, robots`；120 s 全部。音樂長度夾在 30–300 s，門檻 < 45 / < 75 / < 105。
- 白牆運鏡：`D = 7`、眼高 1.6、注視高度 1.9、`yaw0 = 28°`、`yaw(t) = yaw0·(1 − u)³`，其中 `u = clamp(t / 展名中點, 0, 1)`；速度 `V = max(1.5, 所需值)`，全程等速。
- 畫幅：輸出 16:9，內含 2.35:1 黑邊（`LETTERBOX_HALF = (16/9) / 2.35 / 2`）；飽和度 0.8；黑位抬高 0.02。
- 照片：3–500 張；縮圖 256 px；高解析 1600 px；圖集 4096²、16 × 16 格、每格 256 px。
- 不得出現 Intel、Core、Facebook 等商標文字或標誌；不內建 Nijiko 的錄音或旋律。
- 決定性：布景的 `update(t)`、`poseAt(t)`、`fadeAt(t)`、配樂合成不得使用 `Math.random()` 或系統時間。唯一例外是展名時間戳，它在生成專案時計算一次，之後固定不變。
- UI 文案為繁體中文；影片內的展覽文字沿用原作的英文版式。
- 不新增執行期依賴。

## Review Focus

1. **超過 256 張照片（跨越多張圖集）**：instanced 物件必須依圖集分組，每張照片都要顯示自己的格子，不能錯位到別張圖集 → Task 6 的 `atlas-mesh.test.ts`「groups instances by atlas and writes each photo's cell」。
2. **30／60 秒版的白牆文字**：標題、說明文字、展名不得互相重疊，且展名仍要在其中點位於畫面中央 → Task 2 的 `stage-layout.test.ts`「keeps wall texts apart in every preset」。
3. **選擇「配合音樂長度」但音樂無法解碼**：顯示明確錯誤並回到表單，不能卡在忙碌畫面 → Task 13 的 `project.spec.ts`「music length mode with an undecodable file reports an error」。
4. **返回編輯時仍有 Worker 工作在進行**：不得讓已丟棄的專案稍後又把結果寫回來 → Task 4 的 `library.spec.ts`「disposing the pool rejects pending work」，加上 Task 13 的專案取消檢查。
5. **全部都是直式照片，或只有 3 張照片**：Portraits、Moments、影像牆、網絡都要能正常布置（沒有空洞、沒有 NaN）→ Task 2 的 `stage-layout.test.ts`「handles three photos」與「all-portrait photos」。

## File Structure（v2 新增或改動）

```
src/types.ts                        + ShotId, SHOT_ORDER, ShotSpan, Storyboard, LengthMode, MusicStyle
src/plan/storyboard.ts              buildStoryboard, shotIndexAt, presetShots, shotsForLength
src/stage/wall-run.ts               白牆運鏡的純數學（速度、偏航角、注視點）
src/stage/layout.ts                 computeStageLayout（所有布景的純資料配置）
src/camera/shots.ts                 buildShots（分鏡式鏡頭）
src/assets/atlas.ts                 圖集格子的 UV 與像素幾何（純函式）
src/assets/mosaic.ts                assignMosaic（純函式，Worker 內使用）
src/assets/worker-protocol.ts       Worker 訊息型別
src/assets/photo-worker.ts          Worker 入口
src/assets/photo-pool.ts            Worker 池
src/assets/library.ts               loadLibrary、loadHires、bitmapToTexture
src/assets/text.ts / texture-factory.ts   + 字型家族、燈箱貼圖、彩條、文字點陣化
src/util/format.ts                  + formatExhibitionStamp、exhibitionDate
src/stage/parts/{materials,atlas-mesh,canvas-block,text-plane,visitor,thumb,robot-arm,led}.ts
src/stage/{context,dispose,build}.ts
src/stage/sets/{wall,moments,words,likes,videos,robots,mosaic,network,ending}.ts
src/render/{transitions,grade-effect,stage-renderer}.ts
src/audio/score.ts / soundtrack.ts  + composeAiryScore、鐘聲音色、音樂風格、probeAudioDuration
src/ui/{validate,setup-form}.ts、index.html、styles.css   縮圖網格、配樂風格、配合音樂長度
src/app/project.ts、src/main.ts     改接 v2
刪除（Task 13）：src/plan/timeline.ts、src/museum/**、src/camera/keys.ts、src/render/{fades,finish-effect,renderer}.ts、src/assets/photos.ts 及其測試
```

---

### Task 1: 分鏡時長 `plan/storyboard.ts`

**Files:**
- Modify: `src/types.ts`（在檔尾新增型別）
- Create: `src/plan/storyboard.ts`
- Test: `tests/unit/storyboard.test.ts`

**Interfaces:**
- Produces: `ShotId`、`SHOT_ORDER`、`ShotSpan { id; start; end }`、`Storyboard { total; shots }`、`LengthMode = 'auto' | 30 | 60 | 90 | 120 | 'music'`、`MusicStyle = 'airy' | 'calm' | 'upload'`；`BASE_SECONDS`、`MUSIC_MIN = 30`、`MUSIC_MAX = 300`、`photosSeconds(n)`、`presetShots(preset)`、`shotsForLength(seconds)`、`interface StoryboardInput { photoCount; lengthMode; musicDuration: number | null }`、`buildStoryboard(input): Storyboard`、`shotIndexAt(sb, t): number`

- [ ] **Step 1: 在 `src/types.ts` 檔尾新增**

`src/types.ts` append:
```ts

export type ShotId =
  | 'title' | 'intro' | 'exhibition' | 'portraits' | 'photos' | 'moments' | 'words'
  | 'likes' | 'videos' | 'robots' | 'mosaic' | 'network' | 'ending';

export const SHOT_ORDER: readonly ShotId[] = [
  'title', 'intro', 'exhibition', 'portraits', 'photos', 'moments', 'words',
  'likes', 'videos', 'robots', 'mosaic', 'network', 'ending',
];

export type LengthMode = 'auto' | 30 | 60 | 90 | 120 | 'music';

export type MusicStyle = 'airy' | 'calm' | 'upload';

export interface ShotSpan {
  id: ShotId;
  start: number;
  end: number;
}

export interface Storyboard {
  total: number;
  shots: ShotSpan[];
}
```

Run: `cat >> src/types.ts` 以上內容（或用編輯器貼到檔尾）。

- [ ] **Step 2: 寫失敗的測試 `tests/unit/storyboard.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildStoryboard, photosSeconds, presetShots, shotIndexAt, shotsForLength } from '../../src/plan/storyboard';
import { SHOT_ORDER, type LengthMode, type Storyboard } from '../../src/types';

const ids = (sb: Storyboard) => sb.shots.map((s) => s.id);

function expectContiguous(sb: Storyboard): void {
  expect(sb.shots[0].start).toBe(0);
  for (let i = 1; i < sb.shots.length; i++) expect(sb.shots[i].start).toBeCloseTo(sb.shots[i - 1].end, 9);
  expect(sb.shots.at(-1)!.end).toBe(sb.total);
  const order = ids(sb).map((id) => SHOT_ORDER.indexOf(id));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
}

describe('buildStoryboard', () => {
  it('auto mode plays every shot at its base length', () => {
    const sb = buildStoryboard({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
    expect(ids(sb)).toEqual([...SHOT_ORDER]);
    expect(sb.total).toBeCloseTo(143, 9);
    expect(sb.shots.find((s) => s.id === 'photos')!.end - sb.shots.find((s) => s.id === 'photos')!.start).toBeCloseTo(18, 9);
    expectContiguous(sb);
  });

  it('caps the photo wall at 30 s for large libraries', () => {
    expect(photosSeconds(500)).toBe(30);
    expect(buildStoryboard({ photoCount: 500, lengthMode: 'auto', musicDuration: null }).total).toBeCloseTo(155, 9);
  });

  it('fixed lengths pick the preset shots and scale them to the exact length', () => {
    for (const [mode, count] of [[30, 5], [60, 9], [90, 11], [120, 13]] as const) {
      const sb = buildStoryboard({ photoCount: 40, lengthMode: mode, musicDuration: null });
      expect(sb.total).toBe(mode);
      expect(sb.shots).toHaveLength(count);
      expectContiguous(sb);
    }
    expect(ids(buildStoryboard({ photoCount: 3, lengthMode: 30, musicDuration: null }))).toEqual(['title', 'exhibition', 'photos', 'mosaic', 'ending']);
  });

  it('keeps the relative proportions of base lengths when scaling', () => {
    const sb = buildStoryboard({ photoCount: 20, lengthMode: 30, musicDuration: null });
    const title = sb.shots[0];
    const mosaic = sb.shots.find((s) => s.id === 'mosaic')!;
    expect((mosaic.end - mosaic.start) / (title.end - title.start)).toBeCloseTo(10 / 6, 9);
  });

  it('music mode follows the clamped music length and picks shots by threshold', () => {
    const cases: [number, number, number][] = [[20, 30, 5], [44, 44, 5], [70, 70, 9], [100, 100, 11], [200, 200, 13], [400, 300, 13]];
    for (const [music, total, count] of cases) {
      const sb = buildStoryboard({ photoCount: 12, lengthMode: 'music', musicDuration: music });
      expect(sb.total).toBe(total);
      expect(sb.shots).toHaveLength(count);
    }
  });

  it('rejects music mode without a music duration and bad photo counts', () => {
    expect(() => buildStoryboard({ photoCount: 5, lengthMode: 'music', musicDuration: null })).toThrow();
    expect(() => buildStoryboard({ photoCount: 0, lengthMode: 'auto', musicDuration: null })).toThrow();
    expect(() => buildStoryboard({ photoCount: 1.5, lengthMode: 'auto', musicDuration: null })).toThrow();
  });

  it('always opens with title and contains exhibition and photos', () => {
    const modes: LengthMode[] = ['auto', 30, 60, 90, 120];
    for (const lengthMode of modes) {
      const list = ids(buildStoryboard({ photoCount: 7, lengthMode, musicDuration: null }));
      expect(list[0]).toBe('title');
      expect(list).toContain('exhibition');
      expect(list).toContain('photos');
      expect(list.at(-1)).toBe('ending');
    }
  });
});

describe('presets', () => {
  it('shotsForLength matches the preset thresholds', () => {
    expect(shotsForLength(44)).toEqual(presetShots(30));
    expect(shotsForLength(45)).toEqual(presetShots(60));
    expect(shotsForLength(104)).toEqual(presetShots(90));
    expect(shotsForLength(105)).toEqual(presetShots(120));
  });
});

describe('shotIndexAt', () => {
  it('finds the shot containing t and clamps outside the range', () => {
    const sb = buildStoryboard({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
    expect(shotIndexAt(sb, -5)).toBe(0);
    expect(shotIndexAt(sb, 0)).toBe(0);
    expect(shotIndexAt(sb, 6)).toBe(1);
    expect(shotIndexAt(sb, 5.999)).toBe(0);
    expect(shotIndexAt(sb, 1e6)).toBe(sb.shots.length - 1);
  });
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `npx vitest run tests/unit/storyboard.test.ts`
Expected: FAIL（`Cannot find module '../../src/plan/storyboard'`）

- [ ] **Step 4: 實作 `src/plan/storyboard.ts`**

```ts
import { SHOT_ORDER, type LengthMode, type ShotId, type ShotSpan, type Storyboard } from '../types';
import { clamp } from '../util/math';

export const BASE_SECONDS: Record<ShotId, number> = {
  title: 6, intro: 5, exhibition: 7, portraits: 8, photos: 10, moments: 12, words: 14,
  likes: 9, videos: 9, robots: 22, mosaic: 10, network: 16, ending: 7,
};

export const MUSIC_MIN = 30;
export const MUSIC_MAX = 300;

type Preset = 30 | 60 | 90 | 120;

const PRESET_SHOTS: Record<Exclude<Preset, 120>, readonly ShotId[]> = {
  30: ['title', 'exhibition', 'photos', 'mosaic', 'ending'],
  60: ['title', 'intro', 'exhibition', 'portraits', 'photos', 'words', 'mosaic', 'network', 'ending'],
  90: ['title', 'intro', 'exhibition', 'portraits', 'photos', 'moments', 'words', 'robots', 'mosaic', 'network', 'ending'],
};

export interface StoryboardInput {
  photoCount: number;
  lengthMode: LengthMode;
  musicDuration: number | null;
}

export const photosSeconds = (n: number): number => Math.min(30, 10 + 0.4 * n);

export function presetShots(preset: Preset): ShotId[] {
  if (preset === 120) return [...SHOT_ORDER];
  const allowed = new Set(PRESET_SHOTS[preset]);
  return SHOT_ORDER.filter((id) => allowed.has(id));
}

export function shotsForLength(seconds: number): ShotId[] {
  return presetShots(seconds < 45 ? 30 : seconds < 75 ? 60 : seconds < 105 ? 90 : 120);
}

export function buildStoryboard(input: StoryboardInput): Storyboard {
  const n = input.photoCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`photoCount must be a positive integer, got ${n}`);
  const base = (id: ShotId) => (id === 'photos' ? photosSeconds(n) : BASE_SECONDS[id]);

  let ids: ShotId[];
  let target: number | null;
  if (input.lengthMode === 'auto') {
    ids = [...SHOT_ORDER];
    target = null;
  } else if (input.lengthMode === 'music') {
    if (!input.musicDuration || input.musicDuration <= 0) throw new Error('music length mode needs a music duration');
    target = clamp(input.musicDuration, MUSIC_MIN, MUSIC_MAX);
    ids = shotsForLength(target);
  } else {
    target = input.lengthMode;
    ids = presetShots(input.lengthMode);
  }

  const sum = ids.reduce((s, id) => s + base(id), 0);
  const scale = target === null ? 1 : target / sum;
  let cursor = 0;
  const shots: ShotSpan[] = ids.map((id) => {
    const span = { id, start: cursor, end: cursor + base(id) * scale };
    cursor = span.end;
    return span;
  });
  const total = target ?? cursor;
  shots[shots.length - 1].end = total;
  return { total, shots };
}

/** Index of the shot whose span contains t (clamped to the first/last shot). */
export function shotIndexAt(storyboard: Storyboard, t: number): number {
  const { shots } = storyboard;
  let lo = 0;
  let hi = shots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shots[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
```

- [ ] **Step 5: 執行確認通過**

Run: `npx vitest run tests/unit/storyboard.test.ts && npx tsc --noEmit`
Expected: PASS（9 passed），型別檢查無錯誤

- [ ] **Step 6: 提交**

```bash
git add src/types.ts src/plan/storyboard.ts tests/unit/storyboard.test.ts
git commit -m "feat(v2): storyboard with original shot order, presets and music-length mode"
```

---

### Task 2: 白牆運鏡數學與布景配置 `stage/wall-run.ts`、`stage/layout.ts`

**Files:**
- Create: `src/stage/wall-run.ts`, `src/stage/layout.ts`
- Test: `tests/unit/stage-layout.test.ts`

**Interfaces:**
- Consumes: `Storyboard`, `ShotId`, `Vec3`（Task 1）；`buildStoryboard`（測試用）；`clamp`, `lerp`, `mulberry32`
- Produces:
  - `wall-run.ts`：`WALL`、`WALL_TEXT`、`WALL_SHOTS`、`interface WallRun { end: number; exhibitionTime: number; speed: number }`、`wallRunOf(sb)`、`cameraX(run, t)`、`yawAt(run, t)`、`focusX(run, t)`、`titleX()`、`wallPose(run, t): { pos: Vec3; target: Vec3; fov: number }`
  - `layout.ts`：`CanvasItem`、`VisitorSpot`、`WallLayout`、`MomentsLayout`、`WordsLayout`、`Monitor`、`LikesLayout`、`VideosLayout`、`RobotsLayout`、`NetworkLayout`、`StageLayout`、`StageLayoutInput`；常數 `MAX_PORTRAITS = 12`、`MAX_MOMENTS = 6`、`MAX_NETWORK_NODES = 150`、`ROBOT_TILES`、`FLOATERS = 280`、`MOSAIC`、`STARS = 2400`、`VIDEO_WALL`、`LED_WALL`；`pickSpread(n, k, shift?)`、`computeStageLayout(input): StageLayout`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/stage-layout.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildStoryboard } from '../../src/plan/storyboard';
import {
  FLOATERS, MAX_MOMENTS, MAX_NETWORK_NODES, MAX_PORTRAITS, MOSAIC, ROBOT_TILES, STARS,
  computeStageLayout, pickSpread, type CanvasItem,
} from '../../src/stage/layout';
import { WALL, WALL_TEXT, cameraX, focusX, titleX, wallPose, wallRunOf, yawAt } from '../../src/stage/wall-run';
import type { LengthMode } from '../../src/types';

const aspectsFor = (n: number, pattern = [1.5, 0.75, 1, 1.78, 0.5]) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);

function make(n: number, lengthMode: LengthMode = 'auto', aspects = aspectsFor(n)) {
  const storyboard = buildStoryboard({ photoCount: n, lengthMode, musicDuration: null });
  return { storyboard, layout: computeStageLayout({ storyboard, aspects, portraitIndex: Math.min(2, n - 1), seed: 11 }) };
}

const allFinite = (v: unknown): boolean =>
  typeof v === 'number' ? Number.isFinite(v)
  : Array.isArray(v) ? v.every(allFinite)
  : v !== null && typeof v === 'object' ? Object.values(v).every(allFinite)
  : true;

const overlapArea = (a: CanvasItem, b: CanvasItem) => {
  const dx = Math.min(a.center[0] + a.width / 2, b.center[0] + b.width / 2) - Math.max(a.center[0] - a.width / 2, b.center[0] - b.width / 2);
  const dy = Math.min(a.center[1] + a.height / 2, b.center[1] + b.height / 2) - Math.max(a.center[1] - a.height / 2, b.center[1] - b.height / 2);
  return dx > 0 && dy > 0 ? dx * dy : 0;
};

describe('wall run', () => {
  it('uses the base speed for the auto cut and speeds up only when texts would not fit', () => {
    expect(wallRunOf(make(20).storyboard).speed).toBe(WALL.speed);
    expect(wallRunOf(make(20, 30).storyboard).speed).toBeGreaterThan(WALL.speed);
  });

  it('starts turned right and reaches exactly parallel at the exhibition midpoint', () => {
    const run = wallRunOf(make(20).storyboard);
    expect(yawAt(run, 0)).toBeCloseTo(WALL.yaw0, 12);
    expect(yawAt(run, run.exhibitionTime)).toBe(0);
    expect(yawAt(run, run.exhibitionTime + 3)).toBe(0);
    let prev = Infinity;
    for (let t = 0; t <= run.end; t += 0.1) {
      const y = yawAt(run, t);
      expect(y).toBeLessThanOrEqual(prev + 1e-12);
      prev = y;
    }
    const pose = wallPose(run, run.exhibitionTime);
    expect(pose.target[0]).toBeCloseTo(pose.pos[0], 9);
  });

  it('title sits just right of the initial focus point', () => {
    const run = wallRunOf(make(20).storyboard);
    expect(titleX()).toBeCloseTo(focusX(run, 0) + 0.6, 9);
  });
});

describe('computeStageLayout', () => {
  it('centres the exhibition text on the camera at the exhibition midpoint', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      const { layout } = make(20, mode);
      const run = layout.wall.run;
      expect(layout.wall.exhibition.center[0]).toBeCloseTo(cameraX(run, run.exhibitionTime), 9);
    }
  });

  it('keeps wall texts apart in every preset', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      for (const n of [3, 20, 500]) {
        const { layout } = make(n, mode);
        const { title, intro, exhibition } = layout.wall;
        const titleRight = title.center[0] + title.width / 2;
        const exLeft = exhibition.center[0] - exhibition.width / 2;
        if (intro) {
          const introLeft = intro.avatar.center[0] - intro.avatar.width / 2;
          const introRight = intro.center[0] + intro.width / 2;
          expect(introLeft).toBeGreaterThanOrEqual(titleRight + WALL_TEXT.gap - 1e-9);
          expect(introRight).toBeLessThanOrEqual(exLeft - WALL_TEXT.gap + 1e-9);
        } else {
          expect(exLeft).toBeGreaterThanOrEqual(titleRight + WALL_TEXT.gap - 1e-9);
        }
        const exRight = exhibition.center[0] + exhibition.width / 2;
        const firstAfter = layout.wall.portraits?.items[0] ?? layout.wall.photos.items[0];
        expect(firstAfter.center[0] - firstAfter.width / 2).toBeGreaterThan(exRight);
      }
    }
  });

  it('drops intro and portraits from the 30 s cut', () => {
    const { layout } = make(20, 30);
    expect(layout.wall.intro).toBeNull();
    expect(layout.wall.portraits).toBeNull();
  });

  it('hangs up to 12 square portraits along the portraits pass', () => {
    const { layout, storyboard } = make(60);
    const p = layout.wall.portraits!;
    expect(p.items.length).toBeGreaterThan(0);
    expect(p.items.length).toBeLessThanOrEqual(MAX_PORTRAITS);
    const span = storyboard.shots.find((s) => s.id === 'portraits')!;
    const run = layout.wall.run;
    for (const item of p.items) {
      expect(item.width).toBe(item.height);
      expect(item.center[0]).toBeLessThanOrEqual(cameraX(run, span.end));
    }
  });

  it('places every photo on the swarm inside the wall with little overlap', () => {
    for (const n of [3, 10, 100, 500]) {
      const { layout } = make(n);
      const items = layout.wall.photos.items;
      expect(items.map((i) => i.photoIndex)).toEqual(Array.from({ length: n }, (_, i) => i));
      let area = 0;
      let overlap = 0;
      items.forEach((a, i) => {
        area += a.width * a.height;
        expect(a.center[1] - a.height / 2).toBeGreaterThanOrEqual(0.6 - 1e-9);
        expect(a.center[1] + a.height / 2).toBeLessThanOrEqual(WALL.height - 0.6 + 1e-9);
        for (let j = Math.max(0, i - 60); j < i; j++) overlap += overlapArea(a, items[j]);
      });
      expect(overlap / area).toBeLessThan(0.2);
    }
  });

  it('handles three photos', () => {
    const { layout } = make(3);
    expect(layout.moments.boxes).toHaveLength(3);
    expect(layout.likes.monitors.every((m) => m.photoIndex >= 0 && m.photoIndex < 3)).toBe(true);
    expect(layout.network.nodes).toHaveLength(2);
    expect(layout.robots.tiles.every((t) => t.photoIndex < 3)).toBe(true);
    expect(allFinite(layout)).toBe(true);
  });

  it('all-portrait photos keep aspect-correct canvases', () => {
    const { layout } = make(30, 'auto', aspectsFor(30, [0.6]));
    for (const item of layout.wall.photos.items) expect(item.width / item.height).toBeCloseTo(0.6, 9);
    expect(allFinite(layout)).toBe(true);
  });

  it('fills the dark rooms, robots, mosaic and network', () => {
    const { layout } = make(40);
    expect(layout.moments.boxes).toHaveLength(MAX_MOMENTS);
    expect(layout.moments.cameraTo).toBeGreaterThan(layout.moments.cameraFrom);
    expect(layout.likes.monitors).toHaveLength(28);
    expect(layout.likes.monitors.some((m) => m.bars)).toBe(true);
    expect(layout.videos.panels).toHaveLength(12);
    expect(layout.robots.tiles).toHaveLength(ROBOT_TILES.cols * ROBOT_TILES.rows);
    expect(new Set(layout.robots.tiles.map((t) => t.photoIndex)).size).toBe(40);
    expect(layout.robots.floaters).toHaveLength(FLOATERS);
    expect(layout.robots.arms).toHaveLength(4);
    expect(layout.mosaic).toEqual(MOSAIC);
    expect(layout.network.nodes.length).toBeLessThanOrEqual(MAX_NETWORK_NODES);
    expect(layout.network.nodes.every((n) => n.photoIndex !== layout.portraitIndex)).toBe(true);
    expect(layout.network.stars).toHaveLength(STARS * 3);
    for (const [a, b] of layout.network.edges) {
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(b).toBeLessThan(layout.network.nodes.length);
    }
  });

  it('lists featured photos once, starting with the portrait', () => {
    const { layout } = make(100);
    expect(layout.featured[0]).toBe(layout.portraitIndex);
    expect(new Set(layout.featured).size).toBe(layout.featured.length);
    expect(layout.featured.length).toBeLessThanOrEqual(1 + MAX_PORTRAITS + MAX_MOMENTS + 1);
  });

  it('is deterministic for the same input', () => {
    expect(make(50).layout).toEqual(make(50).layout);
  });
});

describe('pickSpread', () => {
  it('spreads k distinct indices across n', () => {
    expect(pickSpread(10, 5)).toEqual([1, 3, 5, 7, 9]);
    expect(pickSpread(3, 6).length).toBe(3);
    expect(new Set(pickSpread(500, 12)).size).toBe(12);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/stage-layout.test.ts`
Expected: FAIL（找不到 `../../src/stage/layout`）

- [ ] **Step 3: 實作 `src/stage/wall-run.ts`**

```ts
import type { ShotId, Storyboard, Vec3 } from '../types';
import { clamp } from '../util/math';

export const WALL = {
  distance: 7,
  speed: 1.5,
  yaw0: (28 * Math.PI) / 180,
  eye: 1.6,
  lookY: 1.9,
  height: 6,
  fov: 38,
} as const;

/** Box sizes of the wall texts (metres), used for placement and non-overlap. */
export const WALL_TEXT = {
  titleWidth: 6.4,
  titleHeight: 1.7,
  introTextWidth: 5.2,
  introHeight: 1.2,
  avatar: 0.9,
  exhibitionWidth: 10,
  exhibitionHeight: 3.2,
  gap: 0.8,
} as const;

export const WALL_SHOTS: readonly ShotId[] = ['title', 'intro', 'exhibition', 'portraits', 'photos'];

export interface WallRun {
  /** End time of the continuous wall shot. */
  end: number;
  /** Midpoint of the exhibition shot: the camera is parallel to the wall from here on. */
  exhibitionTime: number;
  /** Constant truck speed (m/s). */
  speed: number;
}

/** Title centre: 0.6 m right of where the camera looks at t = 0. */
export const titleX = (): number => WALL.distance * Math.tan(WALL.yaw0) + 0.6;

export function wallRunOf(storyboard: Storyboard): WallRun {
  if (storyboard.shots[0]?.id !== 'title') throw new Error('storyboard must open with the title shot');
  let end = 0;
  for (const s of storyboard.shots) {
    if (!WALL_SHOTS.includes(s.id)) break;
    end = s.end;
  }
  const exhibition = storyboard.shots.find((s) => s.id === 'exhibition');
  if (!exhibition) throw new Error('storyboard must include the exhibition shot');
  const exhibitionTime = (exhibition.start + exhibition.end) / 2;
  const hasIntro = storyboard.shots.some((s) => s.id === 'intro');
  const introBlock = WALL_TEXT.avatar + 0.2 + WALL_TEXT.introTextWidth;
  const required =
    WALL_TEXT.titleWidth / 2 + WALL_TEXT.gap + (hasIntro ? introBlock + WALL_TEXT.gap : 0) + WALL_TEXT.exhibitionWidth / 2;
  const speed = Math.max(WALL.speed, (titleX() + required) / exhibitionTime);
  return { end, exhibitionTime, speed };
}

export const cameraX = (run: WallRun, t: number): number => run.speed * t;

export function yawAt(run: WallRun, t: number): number {
  const u = clamp(t / run.exhibitionTime, 0, 1);
  return WALL.yaw0 * (1 - u) ** 3;
}

/** Where the view axis meets the wall. */
export const focusX = (run: WallRun, t: number): number => cameraX(run, t) + WALL.distance * Math.tan(yawAt(run, t));

export function wallPose(run: WallRun, t: number): { pos: Vec3; target: Vec3; fov: number } {
  const x = cameraX(run, t);
  const yaw = yawAt(run, t);
  return {
    pos: [x, WALL.eye, WALL.distance],
    target: [x + 10 * Math.sin(yaw), WALL.lookY, WALL.distance - 10 * Math.cos(yaw)],
    fov: WALL.fov,
  };
}
```

- [ ] **Step 4: 實作 `src/stage/layout.ts`**

```ts
import type { ShotId, Storyboard, Vec3 } from '../types';
import { clamp, lerp } from '../util/math';
import { mulberry32 } from '../util/rng';
import { WALL, WALL_TEXT, cameraX, titleX, wallRunOf, type WallRun } from './wall-run';

export const MAX_PORTRAITS = 12;
export const MAX_MOMENTS = 6;
export const MAX_NETWORK_NODES = 150;
export const ROBOT_TILES = { cols: 60, rows: 36, size: 0.15, pitch: 0.155 } as const;
export const FLOATERS = 280;
export const MOSAIC = { cols: 64, rows: 36, tile: 0.25 } as const;
export const STARS = 2400;
export const VIDEO_WALL = { cols: 4, rows: 3, panelWidth: 2, panelHeight: 1.2, gap: 0.06, centerY: 2.5 } as const;
export const LED_WALL = { width: 16, height: 5, centerY: 2.9 } as const;

export interface CanvasItem {
  photoIndex: number;
  center: Vec3;
  width: number;
  height: number;
}

export interface VisitorSpot {
  pos: Vec3;
  yaw: number;
  pose: 0 | 1 | 2;
  dark: boolean;
  scale: number;
}

export interface WallText {
  center: Vec3;
  width: number;
  height: number;
}

export interface WallLayout {
  run: WallRun;
  wallStart: number;
  wallEnd: number;
  title: WallText;
  intro: (WallText & { avatar: CanvasItem }) | null;
  exhibition: WallText;
  portraits: { label: Vec3; items: CanvasItem[] } | null;
  photos: { label: Vec3; items: CanvasItem[] };
  visitors: VisitorSpot[];
}

export interface MomentsLayout {
  boxes: CanvasItem[];
  cameraFrom: number;
  cameraTo: number;
  visitors: VisitorSpot[];
}

export interface WordsLayout {
  center: Vec3;
  width: number;
  height: number;
  visitors: VisitorSpot[];
}

export interface Monitor {
  center: Vec3;
  width: number;
  height: number;
  bars: boolean;
  photoIndex: number;
}

export interface LikesLayout {
  monitors: Monitor[];
  visitors: VisitorSpot[];
}

export interface VideosLayout {
  photoIndex: number;
  panels: { col: number; row: number; center: Vec3; width: number; height: number }[];
  visitors: VisitorSpot[];
}

export interface RobotsLayout {
  platform: { width: number; depth: number; height: number };
  tiles: { photoIndex: number; x: number; z: number; rotation: number }[];
  floaters: { photoIndex: number; pos: Vec3; size: number; phase: number }[];
  arms: { pos: Vec3; yaw: number; phase: number }[];
}

export interface NetworkLayout {
  nodes: { photoIndex: number; pos: Vec3; radius: number }[];
  /** Pairs of node indices; -1 is the central portrait sphere. */
  edges: [number, number][];
  /** Flat xyz star positions. */
  stars: number[];
  starEdges: [number, number][];
  highlights: number[];
}

export interface StageLayout {
  portraitIndex: number;
  /** Photos shown large enough to need a high-resolution texture; the portrait first. */
  featured: number[];
  wall: WallLayout;
  moments: MomentsLayout;
  words: WordsLayout;
  likes: LikesLayout;
  videos: VideosLayout;
  robots: RobotsLayout;
  mosaic: typeof MOSAIC;
  network: NetworkLayout;
}

export interface StageLayoutInput {
  storyboard: Storyboard;
  aspects: number[];
  portraitIndex: number;
  seed: number;
}

/** k distinct indices spread evenly over 0..n-1 (fewer when k > n). */
export function pickSpread(n: number, k: number, shift = 0.5): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(((i + shift) / k) * n) % n;
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return out;
}

const spot = (pos: Vec3, pose: 0 | 1 | 2, rnd: () => number, dark = false, yaw = Math.PI): VisitorSpot => ({
  pos, yaw, pose, dark, scale: 0.97 + rnd() * 0.06,
});

function canvasSize(aspect: number, long: number): { width: number; height: number } {
  return aspect >= 1 ? { width: long, height: long / aspect } : { width: long * aspect, height: long };
}

function overlapWithRecent(items: CanvasItem[], x: number, y: number, w: number, h: number): number {
  let total = 0;
  const margin = 0.06;
  for (let j = Math.max(0, items.length - 40); j < items.length; j++) {
    const o = items[j];
    const dx = Math.min(x + w / 2, o.center[0] + o.width / 2) - Math.max(x - w / 2, o.center[0] - o.width / 2) + margin;
    const dy = Math.min(y + h / 2, o.center[1] + o.height / 2) - Math.max(y - h / 2, o.center[1] - o.height / 2) + margin;
    if (dx > 0 && dy > 0) total += dx * dy;
  }
  return total;
}

/** Salon-style swarm rising from lower left to upper right, thickening as it goes. */
function photoSwarm(aspects: number[], xa: number, xb: number, rnd: () => number): CanvasItem[] {
  const n = aspects.length;
  const span = xb - xa;
  const base = clamp(Math.sqrt((span * 1.6) / n) * 0.72, 0.22, 0.95);
  const placed: CanvasItem[] = [];
  aspects.forEach((aspect, photoIndex) => {
    const u = (photoIndex + 0.5) / n;
    const long = base * (0.8 + 0.4 * rnd());
    const { width, height } = canvasSize(aspect, long);
    const centerY = lerp(1.25, 3.6, u ** 0.8);
    const thickness = lerp(0.4, 2.8, u);
    const x = xa + u * span + (rnd() - 0.5) * Math.min(span / n, 1.2) * 1.5;
    let best: Vec3 = [x, clamp(centerY, 0.6 + height / 2, WALL.height - 0.6 - height / 2), 0];
    let bestOverlap = Infinity;
    for (let k = 0; k < 12; k++) {
      const y = clamp(centerY + (rnd() - 0.5) * thickness, 0.6 + height / 2, WALL.height - 0.6 - height / 2);
      const cx = x + (rnd() - 0.5) * 0.3 * long;
      const overlap = overlapWithRecent(placed, cx, y, width, height);
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = [cx, y, 0];
        if (overlap === 0) break;
      }
    }
    placed.push({ photoIndex, center: best, width, height });
  });
  return placed;
}

function wallLayout(storyboard: Storyboard, aspects: number[], portraitIndex: number, rnd: () => number): WallLayout {
  const run = wallRunOf(storyboard);
  const span = (id: ShotId) => storyboard.shots.find((s) => s.id === id) ?? null;
  const n = aspects.length;
  const title: WallText = { center: [titleX(), 2.75, 0], width: WALL_TEXT.titleWidth, height: WALL_TEXT.titleHeight };
  const exhibitionX = cameraX(run, run.exhibitionTime);
  const exhibition: WallText = { center: [exhibitionX, 2.8, 0], width: WALL_TEXT.exhibitionWidth, height: WALL_TEXT.exhibitionHeight };
  const exRight = exhibitionX + WALL_TEXT.exhibitionWidth / 2;
  const visitors: VisitorSpot[] = [];

  let intro: WallLayout['intro'] = null;
  if (span('intro')) {
    const left = title.center[0] + WALL_TEXT.titleWidth / 2 + WALL_TEXT.gap;
    const right = exhibitionX - WALL_TEXT.exhibitionWidth / 2 - WALL_TEXT.gap;
    const blockWidth = WALL_TEXT.avatar + 0.2 + WALL_TEXT.introTextWidth;
    const blockLeft = (left + right) / 2 - blockWidth / 2;
    intro = {
      center: [blockLeft + WALL_TEXT.avatar + 0.2 + WALL_TEXT.introTextWidth / 2, 2.6, 0],
      width: WALL_TEXT.introTextWidth,
      height: WALL_TEXT.introHeight,
      avatar: { photoIndex: portraitIndex, center: [blockLeft + WALL_TEXT.avatar / 2, 2.6, 0], width: WALL_TEXT.avatar, height: WALL_TEXT.avatar },
    };
  }

  let portraits: WallLayout['portraits'] = null;
  let previousRight = exRight;
  const portraitsSpan = span('portraits');
  if (portraitsSpan) {
    const xa = Math.max(cameraX(run, portraitsSpan.start + 1.2), exRight + 1.5 + 0.5);
    const xb = Math.max(xa, cameraX(run, portraitsSpan.end - 0.4));
    const k = Math.min(MAX_PORTRAITS, n, Math.max(1, Math.floor((xb - xa) / 1.5) + 1));
    const indices = pickSpread(n, k);
    const items = indices.map((photoIndex, i): CanvasItem => ({
      photoIndex,
      center: [indices.length === 1 ? (xa + xb) / 2 : lerp(xa, xb, i / (indices.length - 1)), 1.75, 0],
      width: 1,
      height: 1,
    }));
    portraits = { label: [xa - 0.9, 1.55, 0], items };
    previousRight = items[items.length - 1].center[0] + 0.5;
    const mid = (xa + xb) / 2;
    visitors.push(spot([mid - 0.8, 0, 2.7], 0, rnd), spot([mid + 0.9, 0, 3.0], 1, rnd));
  }

  const photosSpan = span('photos');
  if (!photosSpan) throw new Error('storyboard must include the photos shot');
  const xa = Math.max(cameraX(run, photosSpan.start + 1.2), previousRight + 1.5 + 0.5);
  const xb = Math.max(xa + 4, cameraX(run, photosSpan.end - 0.3));
  const photos = { label: [xa - 0.9, 1.55, 0] as Vec3, items: photoSwarm(aspects, xa, xb, rnd) };
  for (const [u, z, pose] of [[0.28, 2.4, 0], [0.55, 3.3, 2], [0.82, 2.8, 1]] as const) {
    visitors.push(spot([lerp(xa, xb, u), 0, z], pose, rnd));
  }

  return { run, wallStart: -12, wallEnd: Math.max(xb, cameraX(run, run.end)) + 14, title, intro, exhibition, portraits, photos, visitors };
}

function momentsLayout(n: number, rnd: () => number): MomentsLayout {
  const indices = pickSpread(n, Math.min(MAX_MOMENTS, n), 0.37);
  const spacing = 3;
  const boxes = indices.map((photoIndex, i): CanvasItem => ({
    photoIndex, center: [(i - (indices.length - 1) / 2) * spacing, 1.9, 0], width: 1.3, height: 2.8,
  }));
  const first = boxes[0].center[0];
  const last = boxes[boxes.length - 1].center[0];
  return {
    boxes,
    cameraFrom: first - 2.5,
    cameraTo: last + 2.5,
    visitors: [spot([first + 1.4, 0, 2.8], 2, rnd, true), spot([last - 1.8, 0, 3.2], 0, rnd, true)],
  };
}

function likesLayout(n: number, rnd: () => number): LikesLayout {
  const monitors: Monitor[] = [];
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 4; r++) {
      monitors.push({
        center: [-1.5 + (c - 3) * 1.12, 1.21 + r * 0.76, -5],
        width: 1,
        height: 0.62,
        bars: (c + r) % 4 === 1,
        photoIndex: (c * 4 + r) % n,
      });
    }
  }
  return { monitors, visitors: [spot([-3.2, 0, 1.5], 1, rnd, true, 0.4), spot([2.8, 0, -2.5], 0, rnd, true, Math.PI)] };
}

function videosLayout(n: number, rnd: () => number): VideosLayout {
  const { cols, rows, panelWidth, panelHeight, gap, centerY } = VIDEO_WALL;
  const panels = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      panels.push({
        col, row,
        center: [(col - (cols - 1) / 2) * (panelWidth + gap), centerY + ((rows - 1) / 2 - row) * (panelHeight + gap), 0] as Vec3,
        width: panelWidth,
        height: panelHeight,
      });
    }
  }
  return {
    photoIndex: pickSpread(n, 1, 0.61)[0],
    panels,
    visitors: [spot([-1.0, 0, 3.2], 0, rnd, true), spot([0.4, 0, 3.0], 2, rnd, true)],
  };
}

function shuffle(n: number, rnd: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function robotsLayout(n: number, rnd: () => number): RobotsLayout {
  const { cols, rows, pitch } = ROBOT_TILES;
  const order = shuffle(n, rnd);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        photoIndex: order[(r * cols + c) % n],
        x: (c - (cols - 1) / 2) * pitch,
        z: (r - (rows - 1) / 2) * pitch,
        rotation: (rnd() - 0.5) * 0.16,
      });
    }
  }
  const floaters = Array.from({ length: FLOATERS }, () => ({
    photoIndex: Math.floor(rnd() * n),
    pos: [lerp(-10, 10, rnd()), lerp(1.2, 5.5, rnd()), lerp(-7, 1, rnd())] as Vec3,
    size: lerp(0.16, 0.34, rnd()),
    phase: rnd() * Math.PI * 2,
  }));
  const arms = ([[-6.2, 0.6, 0], [6.2, 0.2, 1.7], [-2.6, -4.2, 3.1], [3.0, -4.0, 4.6]] as const).map(([x, z, phase]) => ({
    pos: [x, 0, z] as Vec3,
    yaw: Math.atan2(-x, -z),
    phase,
  }));
  return { platform: { width: 10, depth: 6, height: 0.35 }, tiles, floaters, arms };
}

function fibonacci(count: number): Vec3[] {
  if (count === 1) return [[0, 1, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i): Vec3 => {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
  });
}

function networkLayout(n: number, portraitIndex: number, rnd: () => number): NetworkLayout {
  const others = Array.from({ length: n }, (_, i) => i).filter((i) => i !== portraitIndex);
  const picked = others.length <= MAX_NETWORK_NODES ? others : pickSpread(others.length, MAX_NETWORK_NODES).map((i) => others[i]);
  const dirs = fibonacci(Math.max(1, picked.length));
  const nodes = picked.map((photoIndex, i) => {
    const r = lerp(3, 7, rnd());
    const [x, y, z] = dirs[i];
    return { photoIndex, pos: [x * r, y * r, z * r] as Vec3, radius: lerp(0.16, 0.3, rnd()) };
  });
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    edges.push([Math.min(a, b), Math.max(a, b)]);
  };
  for (let i = 0; i < Math.min(24, nodes.length); i++) add(-1, i);
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) }))
      .filter((x) => x.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => add(i, j));
  });
  const stars: number[] = [];
  for (const [x, y, z] of fibonacci(STARS)) {
    const r = lerp(8, 16, rnd());
    stars.push(x * r, y * r, z * r);
  }
  const starEdges: [number, number][] = [];
  for (let i = 0; i < STARS; i += 2) {
    if (i + 21 < STARS) starEdges.push([i, i + 21]);
    if (i + 34 < STARS) starEdges.push([i, i + 34]);
  }
  const highlights = Array.from({ length: Math.ceil(STARS / 60) }, (_, k) => k * 60);
  return { nodes, edges, stars, starEdges, highlights };
}

export function computeStageLayout(input: StageLayoutInput): StageLayout {
  const n = input.aspects.length;
  if (n === 0) throw new Error('stage layout needs at least one photo');
  const portraitIndex = clamp(Math.round(input.portraitIndex), 0, n - 1);
  const rnd = mulberry32(input.seed);
  const wall = wallLayout(input.storyboard, input.aspects, portraitIndex, rnd);
  const moments = momentsLayout(n, rnd);
  const words: WordsLayout = {
    center: [0, LED_WALL.centerY, 0],
    width: LED_WALL.width,
    height: LED_WALL.height,
    visitors: [spot([-3.5, 0, 3.0], 0, rnd, true), spot([4.5, 0, 2.4], 1, rnd, true)],
  };
  const likes = likesLayout(n, rnd);
  const videos = videosLayout(n, rnd);
  const robots = robotsLayout(n, rnd);
  const network = networkLayout(n, portraitIndex, rnd);
  const featured = [
    ...new Set([
      portraitIndex,
      ...(wall.portraits?.items.map((i) => i.photoIndex) ?? []),
      ...moments.boxes.map((b) => b.photoIndex),
      videos.photoIndex,
    ]),
  ];
  return { portraitIndex, featured, wall, moments, words, likes, videos, robots, mosaic: MOSAIC, network };
}
```

- [ ] **Step 5: 執行確認通過**

Run: `npx vitest run tests/unit/stage-layout.test.ts && npx tsc --noEmit`
Expected: PASS（15 passed），型別檢查無錯誤。若「little overlap」失敗：只調整 `photoSwarm` 的 `base` 係數（0.72）或嘗試次數，不改門檻。

- [ ] **Step 6: 提交**

```bash
git add src/stage tests/unit/stage-layout.test.ts
git commit -m "feat(v2): wall-run camera maths and pure stage layout for every set"
```

---

### Task 3: 分鏡式鏡頭 `camera/shots.ts`

**Files:**
- Create: `src/camera/shots.ts`
- Test: `tests/unit/shots.test.ts`

**Interfaces:**
- Consumes: `createCameraPath`, `Keyframe`, `CameraPose`（v1 `camera/hermite.ts`）；`wallRunOf`, `wallPose`, `WALL`（Task 2）；`StageLayout`（Task 2）；`shotIndexAt`（Task 1）
- Produces: `interface ShotPose extends CameraPose { fov: number }`、`interface ShotPath { readonly duration: number; poseAt(t: number): ShotPose }`、`buildShots(storyboard, layout): ShotPath`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/shots.test.ts`**

```ts
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
    expect(d(span.end)).toBeGreaterThan(d(span.start) * 10);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/shots.test.ts`
Expected: FAIL（找不到 `../../src/camera/shots`）

- [ ] **Step 3: 實作 `src/camera/shots.ts`**

```ts
import { shotIndexAt } from '../plan/storyboard';
import type { StageLayout } from '../stage/layout';
import { wallPose, wallRunOf, type WallRun } from '../stage/wall-run';
import type { ShotSpan, Storyboard, Vec3 } from '../types';
import { clamp, lerp, smoothstep } from '../util/math';
import { createCameraPath, type CameraPose, type Keyframe } from './hermite';

export interface ShotPose extends CameraPose {
  fov: number;
}

export interface ShotPath {
  readonly duration: number;
  poseAt(t: number): ShotPose;
}

type ShotFn = (t: number) => ShotPose;

const key = (t: number, pos: Vec3, target: Vec3): Keyframe => ({ t, pos, target, hold: false });

function keyed(keys: Keyframe[], fov: number): ShotFn {
  const path = createCameraPath(keys);
  return (t) => ({ ...path.poseAt(t), fov });
}

const arc = (angle: number, radius: number, y: number): Vec3 => [radius * Math.sin(angle), y, radius * Math.cos(angle)];

function shotFn(span: ShotSpan, layout: StageLayout, run: WallRun): ShotFn {
  const { start: s, end: e } = span;
  const d = e - s;
  const at = (u: number) => s + u * d;
  const local = (t: number) => clamp((t - s) / d, 0, 1);
  switch (span.id) {
    case 'title':
    case 'intro':
    case 'exhibition':
    case 'portraits':
    case 'photos':
      return (t) => wallPose(run, t);
    case 'moments': {
      const { cameraFrom, cameraTo } = layout.moments;
      const yaw = (10 * Math.PI) / 180;
      return (t) => {
        const x = lerp(cameraFrom, cameraTo, local(t));
        return { pos: [x, 1.6, 6.5], target: [x + 10 * Math.sin(yaw), 1.8, 6.5 - 10 * Math.cos(yaw)], fov: 40 };
      };
    }
    case 'words':
      return keyed([key(s, [-4, 1.7, 9], [-4, 2.5, 0]), key(at(0.55), [2, 1.7, 9], [2, 2.5, 0]), key(e, [0.5, 2.2, 4.2], [0.3, 2.9, 0])], 40);
    case 'likes':
      return keyed([key(s, arc(-0.7, 7.5, 1.9), [0, 1.9, 0]), key(at(0.5), arc(-0.21, 7.2, 2.1), [0, 2.0, 0]), key(e, arc(0.26, 7, 2.3), [0, 2.1, 0])], 40);
    case 'videos':
      return (t) => {
        const x = lerp(-2.5, 2.5, local(t));
        return { pos: [x, 1.7, 8.5], target: [x * 0.4, 2.3, 0], fov: 40 };
      };
    case 'robots': {
      const cut = at(0.6);
      const wide = keyed([key(s, [-9, 3.6, 10], [0, 0.9, 0]), key(at(0.3), [-2, 3.2, 11], [0, 0.9, 0]), key(cut, [6, 2.6, 8.5], [1, 0.8, 0])], 42);
      const low = keyed([key(cut, [-4.5, 1.0, 3.8], [-1.5, 0.35, 0]), key(e, [3.5, 0.75, 2.2], [5, 0.35, -1])], 42);
      return (t) => (t < cut ? wide(t) : low(t));
    }
    case 'mosaic':
      return (t) => {
        const u = smoothstep(0, 1, local(t));
        return { pos: [0.6 * (1 - u), 0.3 * (1 - u), lerp(2.4, 24, u * u)], target: [0.3 * (1 - u), 0, 0], fov: 42 };
      };
    case 'network':
      return keyed([key(s, [0.4, 0.2, 1.6], [0, 0, 0]), key(at(0.35), [1.5, 1.0, 6], [0, 0, 0]), key(at(0.7), [-3, 3, 16], [0, 0, 0]), key(e, [0, 4, 30], [0, 0, 0])], 45);
    case 'ending':
      return () => ({ pos: [0, 0, 6.2], target: [0, -0.2, 0], fov: 35 });
  }
}

export function buildShots(storyboard: Storyboard, layout: StageLayout): ShotPath {
  const run = wallRunOf(storyboard);
  const fns = storyboard.shots.map((span) => shotFn(span, layout, run));
  return {
    duration: storyboard.total,
    poseAt(t: number): ShotPose {
      const i = shotIndexAt(storyboard, t);
      const span = storyboard.shots[i];
      return fns[i](clamp(t, span.start, span.end));
    },
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/shots.test.ts && npx tsc --noEmit`
Expected: PASS（6 passed）

- [ ] **Step 5: 提交**

```bash
git add src/camera/shots.ts tests/unit/shots.test.ts
git commit -m "feat(v2): shot-based camera with constant-speed wall truck and per-set moves"
```

---
### Task 4: Worker 照片管線 `assets/atlas.ts`、`mosaic.ts`、`photo-worker.ts`、`photo-pool.ts`、`library.ts`

**Files:**
- Create: `src/assets/atlas.ts`, `src/assets/mosaic.ts`, `src/assets/worker-protocol.ts`, `src/assets/photo-worker.ts`, `src/assets/photo-pool.ts`, `src/assets/library.ts`
- Test: `tests/unit/atlas.test.ts`, `tests/unit/mosaic.test.ts`, `tests/e2e/library.spec.ts`

**Interfaces:**
- Consumes: `mulberry32`, `clamp`（v1 util）；`loadModule`, `b64`（v1 e2e helpers）
- Produces:
  - `atlas.ts`：`ATLAS = { size: 4096, cell: 256, perRow: 16, perAtlas: 256 }`、`type UvRect = [u, v, w, h]`、`interface AtlasCell { atlas: number; fit: UvRect; square: UvRect }`、`fitWithin(w, h, maxEdge)`、`thumbSize(aspect)`、`cellPixelBox(slot, aspect)`、`atlasCell(index, aspect)`、`atlasCount(n)`
  - `mosaic.ts`：`assignMosaic(cells: Float32Array, photos: Float32Array, seed: number): Int32Array`
  - `photo-pool.ts`：`interface ThumbResult { bitmap; aspect; color: [r, g, b] }`、`interface PhotoPool { size; thumb; hires; grid; atlas; led; mosaic; dispose }`、`defaultPoolSize()`、`createPhotoPool(size?)`
  - `library.ts`：`THUMB_EDGE = 256`、`HIRES_EDGE = 1600`、`interface PhotoLibrary { readonly count: number; aspects: number[]; colors: [number, number, number][]; sourceIndices: number[]; atlases: Texture[]; cell(index): AtlasCell; hires: Map<number, Texture>; dispose(): void }`、`bitmapToTexture(bitmap)`、`loadLibrary(files, pool, onProgress?)`、`loadHires(library, files, indices, pool)`

UV 慣例：圖集是 `CanvasTexture`（`flipY = true`），v 由下往上；圖集像素座標的 row 0 在上。`fit` 是照片依原始長寬比置中的區域，`square` 是其中央的正方形；四邊各內縮 1 px，避免取樣到相鄰格子。

- [ ] **Step 1: 寫失敗的單元測試**

`tests/unit/atlas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ATLAS, atlasCell, atlasCount, cellPixelBox, fitWithin, thumbSize } from '../../src/assets/atlas';

describe('atlas geometry', () => {
  it('sizes thumbnails to the cell by their long edge', () => {
    expect(thumbSize(1)).toEqual({ width: 256, height: 256 });
    expect(thumbSize(2)).toEqual({ width: 256, height: 128 });
    expect(thumbSize(0.5)).toEqual({ width: 128, height: 256 });
  });

  it('centres a thumbnail inside its cell, row 0 at the top', () => {
    expect(cellPixelBox(0, 2)).toEqual({ x: 0, y: 64, width: 256, height: 128 });
    expect(cellPixelBox(17, 1)).toEqual({ x: 256, y: 256, width: 256, height: 256 });
  });

  it('maps cells to bottom-up UV rects inset by one pixel', () => {
    const px = 1 / ATLAS.size;
    const c = atlasCell(0, 1);
    expect(c.atlas).toBe(0);
    c.fit.forEach((v, i) => expect(v).toBeCloseTo([px, 1 - 255 * px, 254 * px, 254 * px][i], 12));
    expect(c.square).toEqual(c.fit);
  });

  it('keeps the square inside the fit rect for wide and tall photos', () => {
    for (const aspect of [0.4, 0.75, 1.6, 3]) {
      const { fit, square } = atlasCell(5, aspect);
      expect(square[0]).toBeGreaterThanOrEqual(fit[0] - 1e-12);
      expect(square[1]).toBeGreaterThanOrEqual(fit[1] - 1e-12);
      expect(square[0] + square[2]).toBeLessThanOrEqual(fit[0] + fit[2] + 1e-12);
      expect(square[1] + square[3]).toBeLessThanOrEqual(fit[1] + fit[3] + 1e-12);
      expect(square[2]).toBeCloseTo(square[3], 12);
      expect(fit[2] / fit[3] / aspect).toBeCloseTo(1, 1);
    }
  });

  it('rolls over to the next atlas after 256 photos', () => {
    expect(atlasCell(255, 1).atlas).toBe(0);
    expect(atlasCell(256, 1).atlas).toBe(1);
    expect(atlasCell(256, 1).fit).toEqual(atlasCell(0, 1).fit);
    expect(atlasCount(256)).toBe(1);
    expect(atlasCount(257)).toBe(2);
    expect(atlasCount(500)).toBe(2);
  });

  it('fitWithin scales only when needed', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
});
```

`tests/unit/mosaic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { assignMosaic } from '../../src/assets/mosaic';

describe('assignMosaic', () => {
  const photos = new Float32Array([0, 0, 0, 1, 1, 1, 0.5, 0.5, 0.5, 1, 0, 0]);

  it('picks the closest photo when the others are far away', () => {
    const cells = new Float32Array([0.02, 0.01, 0, 0.98, 1, 1, 0.9, 0.05, 0.02]);
    expect(Array.from(assignMosaic(cells, photos, 1))).toEqual([0, 1, 3]);
  });

  it('is deterministic and stays in range', () => {
    const cells = new Float32Array(64 * 36 * 3).map((_, i) => (i % 17) / 17);
    const a = assignMosaic(cells, photos, 9);
    expect(Array.from(a)).toEqual(Array.from(assignMosaic(cells, photos, 9)));
    expect(a).toHaveLength(64 * 36);
    expect(Math.max(...a)).toBeLessThan(4);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
  });

  it('works with a single photo and rejects none', () => {
    expect(Array.from(assignMosaic(new Float32Array([0.3, 0.3, 0.3, 0.9, 0.9, 0.9]), new Float32Array([0.5, 0.5, 0.5]), 1))).toEqual([0, 0]);
    expect(() => assignMosaic(new Float32Array(3), new Float32Array(0), 1)).toThrow();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/atlas.test.ts tests/unit/mosaic.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `src/assets/atlas.ts` 與 `src/assets/mosaic.ts`**

`src/assets/atlas.ts`:
```ts
export const ATLAS = { size: 4096, cell: 256, perRow: 16, perAtlas: 256 } as const;

export type UvRect = [number, number, number, number];

export interface AtlasCell {
  atlas: number;
  /** The whole photo at its own aspect ratio. */
  fit: UvRect;
  /** The centred square of the photo. */
  square: UvRect;
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function thumbSize(aspect: number): { width: number; height: number } {
  const c = ATLAS.cell;
  return aspect >= 1
    ? { width: c, height: Math.max(1, Math.round(c / aspect)) }
    : { width: Math.max(1, Math.round(c * aspect)), height: c };
}

/** Pixel box of a thumbnail inside its atlas (row 0 at the top), centred in its cell. */
export function cellPixelBox(slot: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const { cell, perRow } = ATLAS;
  const { width, height } = thumbSize(aspect);
  return {
    x: (slot % perRow) * cell + Math.floor((cell - width) / 2),
    y: Math.floor(slot / perRow) * cell + Math.floor((cell - height) / 2),
    width,
    height,
  };
}

export function atlasCell(index: number, aspect: number): AtlasCell {
  const { size, perAtlas } = ATLAS;
  const box = cellPixelBox(index % perAtlas, aspect);
  const toUv = (x: number, y: number, w: number, h: number): UvRect => [
    (x + 1) / size,
    1 - (y + h - 1) / size,
    (w - 2) / size,
    (h - 2) / size,
  ];
  const side = Math.min(box.width, box.height);
  return {
    atlas: Math.floor(index / perAtlas),
    fit: toUv(box.x, box.y, box.width, box.height),
    square: toUv(box.x + Math.floor((box.width - side) / 2), box.y + Math.floor((box.height - side) / 2), side, side),
  };
}

export const atlasCount = (n: number): number => Math.ceil(n / ATLAS.perAtlas);
```

`src/assets/mosaic.ts`:
```ts
import { mulberry32 } from '../util/rng';

/**
 * For each cell colour (flat rgb) choose a photo (flat rgb average colours) whose colour is close,
 * picking at random among near-equally good candidates so large flat areas are not one repeated photo.
 */
export function assignMosaic(cells: Float32Array, photos: Float32Array, seed: number): Int32Array {
  const nCells = Math.floor(cells.length / 3);
  const nPhotos = Math.floor(photos.length / 3);
  if (nPhotos === 0) throw new Error('mosaic needs at least one photo');
  const rnd = mulberry32(seed);
  const out = new Int32Array(nCells);
  const candidates: number[] = [];
  for (let c = 0; c < nCells; c++) {
    const r = cells[c * 3];
    const g = cells[c * 3 + 1];
    const b = cells[c * 3 + 2];
    let best = Infinity;
    const dist = (p: number) => {
      const dr = photos[p * 3] - r;
      const dg = photos[p * 3 + 1] - g;
      const db = photos[p * 3 + 2] - b;
      return dr * dr + dg * dg + db * db;
    };
    for (let p = 0; p < nPhotos; p++) best = Math.min(best, dist(p));
    candidates.length = 0;
    const limit = best * 1.5 + 0.002;
    for (let p = 0; p < nPhotos && candidates.length < 3; p++) if (dist(p) <= limit) candidates.push(p);
    let pick = candidates[Math.floor(rnd() * candidates.length)];
    if (c > 0 && pick === out[c - 1] && candidates.length > 1) pick = candidates.find((p) => p !== out[c - 1])!;
    out[c] = pick;
  }
  return out;
}
```

- [ ] **Step 4: 執行單元測試確認通過**

Run: `npx vitest run tests/unit/atlas.test.ts tests/unit/mosaic.test.ts`
Expected: PASS（9 passed）

- [ ] **Step 5: 寫失敗的瀏覽器測試 `tests/e2e/library.spec.ts`**（涵蓋 Review Focus #4）

```ts
import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;
const NAMES = ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg', 'photo-rotated.jpg', 'photo-large.jpg', 'not-an-image.jpg'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/assets/library.ts', '__library');
  await loadModule(page, '/src/assets/photo-pool.ts', '__pool');
  await page.evaluate((data) => {
    const w = window as AnyWindow;
    // "12-photo-3.jpg" → bytes of photo-3.jpg, so tests can build many distinct files cheaply.
    w.__files = (names: string[]) =>
      names.map((name) => new File([Uint8Array.from(atob(data[name.replace(/^\d+-/, '')]), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' }));
  }, Object.fromEntries(NAMES.map((n) => [n, b64(n)])));
});

test('decodes in workers, honours EXIF orientation and reports undecodable files', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const progress: number[] = [];
    const { library, failed } = await w.__library.loadLibrary(
      w.__files(['photo-1.jpg', 'photo-rotated.jpg', 'not-an-image.jpg', 'photo-large.jpg']), pool, (done: number) => progress.push(done));
    const out = {
      count: library.count, failed, sources: library.sourceIndices, aspects: library.aspects,
      atlases: library.atlases.length, atlasWidth: library.atlases[0].image.width, lastProgress: progress.at(-1),
      colorsInRange: library.colors.every((c: number[]) => c.every((v) => v >= 0 && v <= 1)),
    };
    pool.dispose();
    return out;
  });
  expect(r).toMatchObject({ count: 3, failed: ['not-an-image.jpg'], sources: [0, 1, 3], atlases: 1, atlasWidth: 4096, lastProgress: 4, colorsInRange: true });
  expect(r.aspects[1]).toBeCloseTo(800 / 1200, 2);
});

test('loads high-resolution versions only for the requested photos', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const files = w.__files(['photo-1.jpg', 'photo-2.jpg', 'photo-large.jpg']);
    const { library } = await w.__library.loadLibrary(files, pool);
    await w.__library.loadHires(library, files, [2], pool);
    const tex = library.hires.get(2);
    const out = { size: library.hires.size, width: tex.image.width, height: tex.image.height };
    pool.dispose();
    return out;
  });
  expect(r).toEqual({ size: 1, width: 1600, height: 1200 });
});

test('handles 300 photos across two atlases within the time budget', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool();
    const names = Array.from({ length: 300 }, (_, i) => `${i}-photo-${(i % 5) + 1}.jpg`);
    const started = performance.now();
    const { library, failed } = await w.__library.loadLibrary(w.__files(names), pool);
    const out = { count: library.count, failed: failed.length, atlases: library.atlases.length, ms: performance.now() - started, workers: pool.size };
    pool.dispose();
    return out;
  });
  expect(r).toMatchObject({ count: 300, failed: 0, atlases: 2 });
  expect(r.workers).toBeGreaterThanOrEqual(2);
  expect(r.ms).toBeLessThan(30_000);
});

test('computes a portrait colour grid, mosaic assignment and LED dots in the worker', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const [file] = w.__files(['photo-2.jpg']);
    const grid: Float32Array = await pool.grid(file, 64, 36);
    const assignment: Int32Array = await pool.mosaic(grid, new Float32Array([0, 0, 0, 1, 1, 1, 0.5, 0.2, 0.2]), 7);
    const mask = new Uint8Array(40 * 10);
    for (let i = 0; i < mask.length; i += 3) mask[i] = 255;
    const led: ImageBitmap = await pool.led(mask, 40, 10, 6);
    const out = {
      gridLength: grid.length, gridInRange: Array.from(grid).every((v) => v >= 0 && v <= 1),
      assignmentLength: assignment.length, assignmentMax: Math.max(...assignment), ledSize: [led.width, led.height],
    };
    pool.dispose();
    return out;
  });
  expect(r).toEqual({ gridLength: 64 * 36 * 3, gridInRange: true, assignmentLength: 64 * 36, assignmentMax: r.assignmentMax, ledSize: [240, 60] });
  expect(r.assignmentMax).toBeLessThan(3);
});

test('disposing the pool rejects pending work', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const jobs = w.__files(Array.from({ length: 30 }, (_, i) => `${i}-photo-large.jpg`)).map((f: File) => pool.thumb(f, 256));
    pool.dispose();
    const settled = await Promise.allSettled(jobs);
    return { rejected: settled.filter((s) => s.status === 'rejected').length, reason: String((settled[0] as PromiseRejectedResult).reason) };
  });
  expect(r.rejected).toBe(30);
  expect(r.reason).toContain('disposed');
});
```

Run: `npx playwright test tests/e2e/library.spec.ts --timeout 20000`
Expected: FAIL（`/src/assets/library.ts` 不存在，模組載入逾時）

- [ ] **Step 6: 實作 Worker 通訊協定、Worker、Pool 與 Library**

`src/assets/worker-protocol.ts`:
```ts
export type WorkerRequest =
  | { id: number; type: 'thumb'; file: Blob; maxEdge: number }
  | { id: number; type: 'hires'; file: Blob; maxEdge: number }
  | { id: number; type: 'grid'; file: Blob; cols: number; rows: number }
  | { id: number; type: 'atlas'; thumbs: ImageBitmap[]; aspects: number[] }
  | { id: number; type: 'led'; mask: Uint8Array; cols: number; rows: number; dot: number }
  | { id: number; type: 'mosaic'; cells: Float32Array; photos: Float32Array; seed: number };

export type WorkerResult =
  | { type: 'thumb'; bitmap: ImageBitmap; aspect: number; color: [number, number, number] }
  | { type: 'hires'; bitmap: ImageBitmap }
  | { type: 'grid'; colors: Float32Array }
  | { type: 'atlas'; bitmap: ImageBitmap }
  | { type: 'led'; bitmap: ImageBitmap }
  | { type: 'mosaic'; assignment: Int32Array };

export type WorkerResponse = { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string };

type WithoutId<R> = R extends unknown ? Omit<R, 'id'> : never;

export type WorkerJob = WithoutId<WorkerRequest>;
```

`src/assets/photo-worker.ts`:
```ts
import { ATLAS, cellPixelBox, fitWithin } from './atlas';
import { assignMosaic } from './mosaic';
import type { WorkerRequest, WorkerResponse, WorkerResult } from './worker-protocol';

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D is unavailable');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

const decode = (file: Blob): Promise<ImageBitmap> => createImageBitmap(file, { imageOrientation: 'from-image' });

function averageColor(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): [number, number, number] {
  const data = ctx.getImageData(0, 0, width, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = width * height * 255;
  return [r / n, g / n, b / n];
}

async function resized(file: Blob, maxEdge: number) {
  const bitmap = await decode(file);
  const aspect = bitmap.width / bitmap.height;
  const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const { canvas, ctx } = canvas2d(size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return { canvas, ctx, size, aspect };
}

async function handle(req: WorkerRequest): Promise<[WorkerResult, Transferable[]]> {
  switch (req.type) {
    case 'thumb': {
      const { canvas, ctx, size, aspect } = await resized(req.file, req.maxEdge);
      const color = averageColor(ctx, size.width, size.height);
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'thumb', bitmap, aspect, color }, [bitmap]];
    }
    case 'hires': {
      const { canvas } = await resized(req.file, req.maxEdge);
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'hires', bitmap }, [bitmap]];
    }
    case 'grid': {
      const bitmap = await decode(req.file);
      const target = req.cols / req.rows;
      const source = bitmap.width / bitmap.height;
      const sw = source > target ? bitmap.height * target : bitmap.width;
      const sh = source > target ? bitmap.height : bitmap.width / target;
      const { ctx } = canvas2d(req.cols, req.rows);
      ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, req.cols, req.rows);
      bitmap.close();
      const data = ctx.getImageData(0, 0, req.cols, req.rows).data;
      const colors = new Float32Array(req.cols * req.rows * 3);
      for (let i = 0; i < req.cols * req.rows; i++) {
        colors[i * 3] = data[i * 4] / 255;
        colors[i * 3 + 1] = data[i * 4 + 1] / 255;
        colors[i * 3 + 2] = data[i * 4 + 2] / 255;
      }
      return [{ type: 'grid', colors }, [colors.buffer]];
    }
    case 'atlas': {
      const { canvas, ctx } = canvas2d(ATLAS.size, ATLAS.size);
      req.thumbs.forEach((thumb, slot) => {
        const box = cellPixelBox(slot, req.aspects[slot]);
        ctx.drawImage(thumb, box.x, box.y, box.width, box.height);
        thumb.close();
      });
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'atlas', bitmap }, [bitmap]];
    }
    case 'led': {
      const { cols, rows, dot, mask } = req;
      const { canvas, ctx } = canvas2d(cols * dot, rows * dot);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const radius = dot * 0.36;
      const trace = (lit: boolean) => {
        ctx.beginPath();
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (mask[y * cols + x] > 0 !== lit) continue;
            const cx = (x + 0.5) * dot;
            const cy = (y + 0.5) * dot;
            ctx.moveTo(cx + radius, cy);
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          }
        }
      };
      trace(false);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fill();
      trace(true);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      const bitmap = canvas.transferToImageBitmap();
      return [{ type: 'led', bitmap }, [bitmap]];
    }
    case 'mosaic': {
      const assignment = assignMosaic(req.cells, req.photos, req.seed);
      return [{ type: 'mosaic', assignment }, [assignment.buffer]];
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  let response: WorkerResponse;
  let transfer: Transferable[] = [];
  try {
    const [result, t] = await handle(req);
    response = { id: req.id, ok: true, result };
    transfer = t;
  } catch (err) {
    response = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response, { transfer });
};
```

`src/assets/photo-pool.ts`:
```ts
import { clamp } from '../util/math';
import type { WorkerJob, WorkerRequest, WorkerResponse, WorkerResult } from './worker-protocol';

export interface ThumbResult {
  bitmap: ImageBitmap;
  aspect: number;
  color: [number, number, number];
}

export interface PhotoPool {
  readonly size: number;
  thumb(file: Blob, maxEdge: number): Promise<ThumbResult>;
  hires(file: Blob, maxEdge: number): Promise<ImageBitmap>;
  grid(file: Blob, cols: number, rows: number): Promise<Float32Array>;
  /** Transfers (and so consumes) the thumbnails. */
  atlas(thumbs: ImageBitmap[], aspects: number[]): Promise<ImageBitmap>;
  led(mask: Uint8Array, cols: number, rows: number, dot: number): Promise<ImageBitmap>;
  mosaic(cells: Float32Array, photos: Float32Array, seed: number): Promise<Int32Array>;
  /** Terminates the workers and rejects every queued or running job. */
  dispose(): void;
}

interface Slot {
  worker: Worker;
  busy: number;
}

interface Job {
  request: WorkerRequest;
  transfer: Transferable[];
  slot: Slot | null;
  resolve(result: WorkerResult): void;
  reject(error: Error): void;
}

const MAX_IN_FLIGHT = 2;

export const defaultPoolSize = (): number => clamp((navigator.hardwareConcurrency || 4) - 1, 2, 6);

export function createPhotoPool(size = defaultPoolSize()): PhotoPool {
  const slots: Slot[] = Array.from({ length: size }, () => ({
    worker: new Worker(new URL('./photo-worker.ts', import.meta.url), { type: 'module' }),
    busy: 0,
  }));
  const running = new Map<number, Job>();
  const queue: Job[] = [];
  let nextId = 1;
  let disposed = false;

  function pump(): void {
    while (queue.length > 0) {
      const slot = slots.reduce((a, b) => (b.busy < a.busy ? b : a));
      if (slot.busy >= MAX_IN_FLIGHT) return;
      const job = queue.shift()!;
      job.slot = slot;
      slot.busy++;
      running.set(job.request.id, job);
      slot.worker.postMessage(job.request, job.transfer);
    }
  }

  for (const slot of slots) {
    slot.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const job = running.get(res.id);
      slot.busy = Math.max(0, slot.busy - 1);
      if (job) {
        running.delete(res.id);
        if (res.ok) job.resolve(res.result);
        else job.reject(new Error(res.error));
      }
      pump();
    };
    slot.worker.onerror = (event) => {
      event.preventDefault();
      const error = new Error(`photo worker failed: ${event.message}`);
      for (const [id, job] of running) {
        if (job.slot !== slot) continue;
        running.delete(id);
        job.reject(error);
      }
      slot.busy = 0;
      pump();
    };
  }

  function run(body: WorkerJob, transfer: Transferable[] = []): Promise<WorkerResult> {
    if (disposed) return Promise.reject(new Error('photo pool disposed'));
    return new Promise((resolve, reject) => {
      queue.push({ request: { ...body, id: nextId++ } as WorkerRequest, transfer, slot: null, resolve, reject });
      pump();
    });
  }

  const ofType = <T extends WorkerResult['type']>(type: T) => (r: WorkerResult): Extract<WorkerResult, { type: T }> => {
    if (r.type !== type) throw new Error(`expected a ${type} result, got ${r.type}`);
    return r as Extract<WorkerResult, { type: T }>;
  };

  return {
    size,
    thumb: (file, maxEdge) => run({ type: 'thumb', file, maxEdge }).then(ofType('thumb')),
    hires: (file, maxEdge) => run({ type: 'hires', file, maxEdge }).then(ofType('hires')).then((r) => r.bitmap),
    grid: (file, cols, rows) => run({ type: 'grid', file, cols, rows }).then(ofType('grid')).then((r) => r.colors),
    atlas: (thumbs, aspects) => run({ type: 'atlas', thumbs, aspects }, thumbs).then(ofType('atlas')).then((r) => r.bitmap),
    led: (mask, cols, rows, dot) => run({ type: 'led', mask, cols, rows, dot }).then(ofType('led')).then((r) => r.bitmap),
    mosaic: (cells, photos, seed) => run({ type: 'mosaic', cells, photos, seed }).then(ofType('mosaic')).then((r) => r.assignment),
    dispose() {
      if (disposed) return;
      disposed = true;
      slots.forEach((s) => s.worker.terminate());
      const error = new Error('photo pool disposed');
      [...running.values(), ...queue].forEach((job) => job.reject(error));
      running.clear();
      queue.length = 0;
    },
  };
}
```

`src/assets/library.ts`:
```ts
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { ATLAS, atlasCell, type AtlasCell } from './atlas';
import type { PhotoPool } from './photo-pool';

export const THUMB_EDGE = 256;
export const HIRES_EDGE = 1600;

export interface PhotoLibrary {
  readonly count: number;
  aspects: number[];
  /** Average sRGB colour of each photo, 0..1. */
  colors: [number, number, number][];
  /** Index of each photo's file in the list the user chose. */
  sourceIndices: number[];
  atlases: Texture[];
  cell(index: number): AtlasCell;
  /** High-resolution textures, only for featured photos. */
  hires: Map<number, Texture>;
  dispose(): void;
}

export function bitmapToTexture(bitmap: ImageBitmap): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export async function loadLibrary(
  files: File[],
  pool: PhotoPool,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<{ library: PhotoLibrary; failed: string[] }> {
  let done = 0;
  const results = await Promise.all(
    files.map((file) =>
      pool
        .thumb(file, THUMB_EDGE)
        .then((r) => r, (err: Error) => {
          if (err.message.includes('disposed')) throw err;
          return null;
        })
        .finally(() => onProgress(++done, files.length)),
    ),
  );
  const failed: string[] = [];
  const kept: { sourceIndex: number; aspect: number; color: [number, number, number]; bitmap: ImageBitmap }[] = [];
  results.forEach((r, sourceIndex) => {
    if (r) kept.push({ sourceIndex, aspect: r.aspect, color: r.color, bitmap: r.bitmap });
    else failed.push(files[sourceIndex].name);
  });

  const chunks: (typeof kept)[] = [];
  for (let i = 0; i < kept.length; i += ATLAS.perAtlas) chunks.push(kept.slice(i, i + ATLAS.perAtlas));
  const atlases = await Promise.all(
    chunks.map((chunk) => pool.atlas(chunk.map((k) => k.bitmap), chunk.map((k) => k.aspect)).then(bitmapToTexture)),
  );

  const aspects = kept.map((k) => k.aspect);
  const hires = new Map<number, Texture>();
  const library: PhotoLibrary = {
    count: kept.length,
    aspects,
    colors: kept.map((k) => k.color),
    sourceIndices: kept.map((k) => k.sourceIndex),
    atlases,
    cell: (index) => atlasCell(index, aspects[index]),
    hires,
    dispose() {
      atlases.forEach((t) => t.dispose());
      hires.forEach((t) => t.dispose());
      hires.clear();
    },
  };
  return { library, failed };
}

export async function loadHires(library: PhotoLibrary, files: File[], indices: number[], pool: PhotoPool): Promise<void> {
  await Promise.all(
    indices.map(async (index) => {
      if (library.hires.has(index)) return;
      const bitmap = await pool.hires(files[library.sourceIndices[index]], HIRES_EDGE);
      library.hires.set(index, bitmapToTexture(bitmap));
    }),
  );
}
```

- [ ] **Step 7: 執行測試確認通過**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test tests/e2e/library.spec.ts`
Expected: 型別檢查無錯誤；單元測試全過；e2e 5 passed

- [ ] **Step 8: 提交**

```bash
git add src/assets tests/unit/atlas.test.ts tests/unit/mosaic.test.ts tests/e2e/library.spec.ts
git commit -m "feat(v2): worker pool for decoding, thumbnail atlases, colour grids, mosaic and LED dots"
```

---

### Task 5: 文字、字型、點陣與時間戳

**Files:**
- Modify: `src/assets/texture-factory.ts`, `src/assets/text.ts`, `src/util/format.ts`, `index.html`（字型連結）
- Create: `src/stage/parts/led.ts`
- Test: `tests/unit/util.test.ts`（新增案例）, `tests/unit/led.test.ts`, `tests/e2e/text.spec.ts`

**Interfaces:**
- Produces:
  - `FontFamily = 'sans' | 'serif' | 'grotesk'`；`TextLine.family?`；`TextLine.weight` 增加 `800`；`interface StageTextureFactory extends TextureFactory { lightbox(image, lines): Texture; colorBars(): Texture }`
  - `FAMILY_STACKS`、`ensureFonts(texts)`（載入全部字型家族）、`rasterizeLines(lines, cols, rows, family?, weight?): Uint8Array`、`createCanvasTextureFactory(): StageTextureFactory`
  - `formatExhibitionStamp(date): string`、`exhibitionDate(value, now): Date`
  - `LED`、`textUnits(text)`、`ledLines(words, rows, unitsPerRow)`、`ledWords(keywords, name, subtitle)`

- [ ] **Step 1: 寫失敗的單元測試**

`tests/unit/led.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ledLines, ledWords, textUnits } from '../../src/stage/parts/led';

describe('led text', () => {
  it('counts CJK characters as two units', () => {
    expect(textUnits('AB')).toBe(2);
    expect(textUnits('你好')).toBe(4);
  });

  it('fills every row past the width, uppercased, starting at different words', () => {
    const rows = ledLines(['travel', 'family', '勇氣'], 5, 40);
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(textUnits(row)).toBeGreaterThanOrEqual(40);
    expect(rows[0]).toBe(rows[0].toUpperCase());
    expect(rows[0].slice(0, 6)).not.toBe(rows[1].slice(0, 6));
  });

  it('returns blank rows when there are no words', () => {
    expect(ledLines([' ', ''], 3, 10)).toEqual(['', '', '']);
  });

  it('falls back to the name and subtitle when there are no keywords', () => {
    expect(ledWords([], '小明', '2026 Graduation')).toEqual(['小明', '2026', 'Graduation']);
    expect(ledWords(['a'], '小明', '')).toEqual(['a']);
  });
});
```

`tests/unit/util.test.ts` 在檔尾新增：
```ts
import { exhibitionDate, formatExhibitionStamp } from '../../src/util/format';

describe('exhibition stamp', () => {
  it('matches the original English format', () => {
    expect(formatExhibitionStamp(new Date(2011, 10, 28, 8, 6, 55))).toBe('08:06:55 AM Monday November 28, 2011');
    expect(formatExhibitionStamp(new Date(2011, 5, 4, 17, 4, 15))).toBe('05:04:15 PM Saturday June 4, 2011');
    expect(formatExhibitionStamp(new Date(2026, 0, 1, 0, 0, 0))).toBe('12:00:00 AM Thursday January 1, 2026');
  });

  it('uses the chosen date with the current time, or now when no date is set', () => {
    const now = new Date(2026, 8, 28, 15, 30, 5);
    expect(exhibitionDate('2011-11-28', now)).toEqual(new Date(2011, 10, 28, 15, 30, 5));
    expect(exhibitionDate('', now)).toEqual(now);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/led.test.ts tests/unit/util.test.ts`
Expected: FAIL（找不到 `led` 模組；`formatExhibitionStamp` 不存在）

- [ ] **Step 3: 實作 `src/stage/parts/led.ts` 與 `src/util/format.ts` 新增函式**

`src/stage/parts/led.ts`:
```ts
/** LED wall raster: the text mask is cols × rows pixels, each drawn as a dot `dot` px wide. */
export const LED = { cols: 640, rows: 200, dot: 6, mainRows: 9, mainUnits: 70, highlightRows: 4, highlightUnits: 30 } as const;

/** Width in half-em units: CJK and other wide scripts count 2, everything else 1. */
export function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) units += ch.codePointAt(0)! >= 0x2e80 ? 2 : 1;
  return units;
}

/** Rows of repeated words, each at least `unitsPerRow` wide, each starting at a different word. */
export function ledLines(words: string[], rows: number, unitsPerRow: number): string[] {
  const list = words.map((w) => w.trim()).filter(Boolean);
  if (list.length === 0) return Array.from({ length: rows }, () => '');
  return Array.from({ length: rows }, (_, r) => {
    let line = '';
    let i = (r * 3) % list.length;
    while (textUnits(line) < unitsPerRow) {
      line += (line ? '  ' : '') + list[i];
      i = (i + 1) % list.length;
    }
    return line.toUpperCase();
  });
}

export function ledWords(keywords: string[], name: string, subtitle: string): string[] {
  return keywords.length > 0 ? keywords : [name, ...subtitle.split(/\s+/)].filter(Boolean);
}
```

`src/util/format.ts` 在檔尾新增：
```ts
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number) => String(n).padStart(2, '0');

/** "08:06:55 AM Monday November 28, 2011", as on the original exhibition wall. */
export function formatExhibitionStamp(date: Date): string {
  const h = date.getHours();
  const clock = `${two(h % 12 || 12)}:${two(date.getMinutes())}:${two(date.getSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
  return `${clock} ${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** The form's yyyy-mm-dd date at the current time of day, or now when no date was chosen. */
export function exhibitionDate(value: string, now: Date): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date(now);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), now.getHours(), now.getMinutes(), now.getSeconds());
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/led.test.ts tests/unit/util.test.ts`
Expected: PASS（led 4 passed；util 9 passed）

- [ ] **Step 5: 寫失敗的瀏覽器測試 `tests/e2e/text.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;

test('stage texture helpers render at the expected sizes', async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/assets/text.ts', '__text');
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__text;
    await m.ensureFonts(['HELLO 你好', 'The Museum of Me']);
    const f = m.createCanvasTextureFactory();
    const source = document.createElement('canvas');
    source.width = 800;
    source.height = 600;
    const lightbox = f.lightbox(source, ['NO. 001', '第一天', '2026.09.28']);
    const bars = f.colorBars();
    const mask: Uint8Array = m.rasterizeLines(['HELLO 你好', 'WORLD'], 200, 40);
    const serif = f.text({ lines: [{ text: 'The Museum of Me', px: 64, family: 'serif', weight: 500 }] });
    return {
      lightbox: [lightbox.image.width, lightbox.image.height],
      bars: [bars.image.width, bars.image.height],
      maskLength: mask.length,
      lit: mask.reduce((s, v) => s + (v > 0 ? 1 : 0), 0),
      serifAspect: serif.aspect,
    };
  });
  expect(r.lightbox).toEqual([520, 1120]);
  expect(r.bars).toEqual([640, 480]);
  expect(r.maskLength).toBe(8000);
  expect(r.lit).toBeGreaterThan(200);
  expect(r.serifAspect).toBeGreaterThan(3);
});
```

Run: `npx playwright test tests/e2e/text.spec.ts`
Expected: FAIL（`f.lightbox is not a function`）

- [ ] **Step 6: 更新 `src/assets/texture-factory.ts`（整檔取代）**

```ts
import type { Texture } from 'three';

export type FontFamily = 'sans' | 'serif' | 'grotesk';

export interface TextLine {
  text: string;
  px: number;
  weight?: 300 | 400 | 500 | 700 | 800;
  spacing?: number;
  color?: string;
  family?: FontFamily;
}

export interface TextSpec {
  lines: TextLine[];
  color?: string;
  background?: string;
  padding?: number;
  /** Extra gap between lines, as a fraction of the next line's size. */
  lineGap?: number;
  align?: 'center' | 'left';
  /** Fixed canvas size; otherwise the canvas hugs the text. */
  size?: { width: number; height: number };
}

export interface TextTexture {
  texture: Texture;
  /** Canvas width / height. */
  aspect: number;
}

export interface TextureFactory {
  text(spec: TextSpec): TextTexture;
  glow(): Texture;
}

export type ImageLike = CanvasImageSource & { width: number; height: number };

export interface StageTextureFactory extends TextureFactory {
  /** A tall light-box face: the photo, darkened, with coordinate-style captions at the top. */
  lightbox(image: ImageLike, lines: string[]): Texture;
  /** SMPTE-style colour bars for the monitor wall. */
  colorBars(): Texture;
}
```

- [ ] **Step 7: 更新 `src/assets/text.ts`（整檔取代）**

```ts
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { FontFamily, ImageLike, StageTextureFactory, TextLine, TextSpec, TextTexture } from './texture-factory';

export const FONT_STACK = '"Noto Sans TC", "Noto Sans JP", system-ui, sans-serif';

export const FAMILY_STACKS: Record<FontFamily, string> = {
  sans: FONT_STACK,
  serif: `"Bodoni Moda", "Noto Serif TC", ${FONT_STACK}`,
  grotesk: `"Archivo", ${FONT_STACK}`,
};

const FONT_FACES = [
  '300 32px "Noto Sans TC"', '500 32px "Noto Sans TC"', '700 32px "Noto Sans TC"',
  '400 32px "Bodoni Moda"', '500 32px "Bodoni Moda"', '500 32px "Archivo"', '800 32px "Archivo"',
];

/** Loads every family (and the unicode-range subsets `texts` needs) before canvases are drawn. */
export async function ensureFonts(texts: string[]): Promise<void> {
  const sample = Array.from(new Set(texts.join(''))).join('') || 'A';
  try {
    await Promise.all(FONT_FACES.map((face) => document.fonts.load(face, sample)));
  } catch {
    // Offline or blocked: canvases fall back through the family stacks.
  }
}

const fontOf = (line: TextLine): string => `${line.weight ?? 400} ${line.px}px ${FAMILY_STACKS[line.family ?? 'sans']}`;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function text(spec: TextSpec): TextTexture {
  const lines = spec.lines.filter((l) => l.text.trim() !== '');
  const padding = spec.padding ?? 40;
  const gap = spec.lineGap ?? 0.35;
  const canvas = document.createElement('canvas');
  const ctx = context2d(canvas);
  const widths = lines.map((l) => {
    ctx.font = fontOf(l);
    ctx.letterSpacing = `${l.spacing ?? 0}px`;
    return ctx.measureText(l.text).width;
  });
  const contentW = Math.max(1, ...widths);
  const contentH = lines.reduce((sum, l, i) => sum + l.px * (i === 0 ? 1 : 1 + gap), 0) || 1;
  canvas.width = spec.size?.width ?? Math.ceil(contentW + padding * 2);
  canvas.height = spec.size?.height ?? Math.ceil(contentH + padding * 2);
  // Resizing resets the context state, so styles are applied after sizing.
  if (spec.background) {
    ctx.fillStyle = spec.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const align = spec.align ?? 'center';
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const x = align === 'center' ? canvas.width / 2 : padding;
  let y = (canvas.height - contentH) / 2;
  lines.forEach((l, i) => {
    if (i > 0) y += l.px * gap;
    ctx.font = fontOf(l);
    ctx.letterSpacing = `${l.spacing ?? 0}px`;
    ctx.fillStyle = l.color ?? spec.color ?? '#1d1d1f';
    ctx.fillText(l.text, x, y);
    y += l.px;
  });
  return { texture: toTexture(canvas), aspect: canvas.width / canvas.height };
}

function glow(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = context2d(canvas);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 248, 235, 1)');
  g.addColorStop(0.5, 'rgba(255, 248, 235, 0.35)');
  g.addColorStop(1, 'rgba(255, 248, 235, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

function lightbox(image: ImageLike, lines: string[]): Texture {
  const W = 520;
  const H = 1120;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = context2d(canvas);
  const scale = Math.max(W / image.width, H / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  shade.addColorStop(0.45, 'rgba(0, 0, 0, 0.15)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.filter((l) => l.trim() !== '').forEach((line, i) => {
    ctx.font = `${i === 0 ? 800 : 500} ${i === 0 ? 40 : 28}px ${FAMILY_STACKS.grotesk}`;
    ctx.letterSpacing = i === 0 ? '4px' : '2px';
    ctx.fillText(line, W / 2, i === 0 ? 90 : 150 + (i - 1) * 42);
  });
  return toTexture(canvas);
}

function colorBars(): Texture {
  const W = 640;
  const H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = context2d(canvas);
  const top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const middle = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  const bottom = ['#00214c', '#ffffff', '#32006a', '#131313'];
  const bar = W / top.length;
  top.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bar, 0, bar + 1, H * 0.67); });
  middle.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bar, H * 0.67, bar + 1, H * 0.08); });
  const block = W / bottom.length;
  bottom.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * block, H * 0.75, block + 1, H * 0.25); });
  return toTexture(canvas);
}

/** Draws lines of text into a cols × rows mask (255 = lit) for the LED wall. */
export function rasterizeLines(lines: string[], cols: number, rows: number, family: FontFamily = 'grotesk', weight = 800): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = context2d(canvas);
  const rowHeight = rows / Math.max(1, lines.length);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${Math.floor(rowHeight * 0.8)}px ${FAMILY_STACKS[family]}`;
  ctx.letterSpacing = '1px';
  lines.forEach((line, i) => ctx.fillText(line, 1, (i + 0.5) * rowHeight));
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 255 : 0;
  return mask;
}

export function createCanvasTextureFactory(): StageTextureFactory {
  return { text, glow, lightbox, colorBars };
}
```

- [ ] **Step 8: 更新 `index.html` 的字型連結**

把 `<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;500;700&display=swap" rel="stylesheet" />` 換成：
```html
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;800&family=Bodoni+Moda:wght@400;500&family=Noto+Sans+TC:wght@300;500;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 9: 執行測試確認通過**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test tests/e2e/text.spec.ts tests/e2e/photos.spec.ts`
Expected: 全部 PASS（v1 的 photos.spec 仍通過，表示 `text()` 行為沒有改變）

- [ ] **Step 10: 提交**

```bash
git add src/assets src/util src/stage/parts/led.ts index.html tests/unit/led.test.ts tests/unit/util.test.ts tests/e2e/text.spec.ts
git commit -m "feat(v2): serif/grotesk families, light-box and colour-bar textures, LED text and exhibition stamp"
```

---

### Task 6: 共用零件 `stage/parts/`

**Files:**
- Create: `src/stage/parts/materials.ts`, `src/stage/parts/atlas-mesh.ts`, `src/stage/parts/canvas-block.ts`, `src/stage/parts/text-plane.ts`, `src/stage/parts/visitor.ts`, `src/stage/parts/thumb.ts`, `src/stage/parts/robot-arm.ts`, `tests/unit/fake-library.ts`
- Test: `tests/unit/atlas-mesh.test.ts`, `tests/unit/parts.test.ts`

**Interfaces:**
- Consumes: `PhotoLibrary`（Task 4）、`atlasCell`, `atlasCount`（Task 4）、`TextTexture`（Task 5）、`VisitorSpot`, `Vec3`（Task 2）、`mulberry32`
- Produces:
  - `materials.ts`：`interface StageMaterials { wall; floor; skirting; darkFloor; darkWall; blockSide; plaque; platform; lightboxFrame; monitorBody; pedestal; sculpture; robot: { shell; joint; accent }; visitor: VisitorMaterials; nodeLine; starLine; atlas(texture, lit, doubleSide?): Material; dispose() }`、`createStageMaterials()`
  - `atlas-mesh.ts`：`createAtlasMaterial(atlas, lit, doubleSide?)`、`interface AtlasInstance { photoIndex: number; matrix: Matrix4; color?: Color }`、`buildAtlasInstances({ geometry, library, items, material, rect }): InstancedMesh[]`、`cellTexture(library, index, rect): Texture`
  - `canvas-block.ts`：`BLOCK_DEPTH = 0.06`、`cropTexture(src, aspect, targetAspect)`、`createCanvasBlock(texture, aspect, width, height, side: Material): Mesh`
  - `text-plane.ts`：`fitBox(aspect, maxW, maxH)`、`createTextPlane(text, maxWidth, maxHeight): Mesh`
  - `visitor.ts`：`interface VisitorMaterials { shirt; pants; skin; hair; shoes; silhouette }`、`createVisitor(spot, materials): Group`
  - `thumb.ts`：`createThumbSculpture(material, seed): Group`
  - `robot-arm.ts`：`interface ArmAngles { base; shoulder; elbow; wrist; grip }`、`armAngles(t, phase)`、`interface RobotArm { group; gripper; pose(a) }`、`createRobotArm(materials, held?)`
  - 資源擁有權慣例：只給單一物件使用的材質設 `userData.owned = true`，若貼圖也只屬於它再加 `userData.ownsMap = true`；共用材質歸 `StageMaterials` 管理。

- [ ] **Step 1: 測試用的假圖庫 `tests/unit/fake-library.ts`**

```ts
import { Texture } from 'three';
import { atlasCell, atlasCount } from '../../src/assets/atlas';
import type { PhotoLibrary } from '../../src/assets/library';

export function fakeLibrary(n: number, aspects?: number[], hiresFor: number[] = []): PhotoLibrary {
  const a = aspects ?? Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const atlases = Array.from({ length: atlasCount(n) }, () => new Texture());
  const hires = new Map<number, Texture>();
  for (const i of hiresFor) {
    const t = new Texture();
    t.image = { width: 1600, height: Math.round(1600 / a[i]) };
    hires.set(i, t);
  }
  return {
    count: n,
    aspects: a,
    colors: a.map((_, i) => [(i % 7) / 7, 0.5, 0.4] as [number, number, number]),
    sourceIndices: a.map((_, i) => i),
    atlases,
    cell: (i) => atlasCell(i, a[i]),
    hires,
    dispose() {},
  };
}
```

- [ ] **Step 2: 寫失敗的測試**

`tests/unit/atlas-mesh.test.ts`（涵蓋 Review Focus #1）:
```ts
import { BoxGeometry, Color, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { buildAtlasInstances, cellTexture, createAtlasMaterial } from '../../src/stage/parts/atlas-mesh';
import { fakeLibrary } from './fake-library';

describe('atlas instances', () => {
  it('groups instances by atlas and writes each photo cell', () => {
    const library = fakeLibrary(300);
    const materials = library.atlases.map(() => new MeshBasicMaterial());
    const items = [0, 255, 256, 299, 3].map((photoIndex) => ({ photoIndex, matrix: new Matrix4() }));
    const meshes = buildAtlasInstances({ geometry: new BoxGeometry(), library, items, material: (a) => materials[a], rect: 'square' });
    expect(meshes.map((m) => m.count)).toEqual([3, 2]);
    expect(meshes[1].material).toBe(materials[1]);
    const rects = meshes[1].geometry.getAttribute('uvRect');
    expect(rects.itemSize).toBe(4);
    expect(Array.from(rects.array.slice(0, 4))).toEqual(Array.from(new Float32Array(library.cell(256).square)));
    expect(Array.from(rects.array.slice(4, 8))).toEqual(Array.from(new Float32Array(library.cell(299).square)));
  });

  it('keeps per-instance colours when given', () => {
    const library = fakeLibrary(4);
    const [mesh] = buildAtlasInstances({
      geometry: new BoxGeometry(), library, rect: 'fit', material: () => new MeshBasicMaterial(),
      items: [{ photoIndex: 1, matrix: new Matrix4(), color: new Color(0.2, 0.4, 0.6) }],
    });
    const c = new Color();
    mesh.getColorAt(0, c);
    expect([c.r, c.g, c.b].map((v) => +v.toFixed(3))).toEqual([0.2, 0.4, 0.6]);
  });

  it('injects the uvRect attribute into the map UVs', () => {
    for (const lit of [true, false]) {
      const material = createAtlasMaterial(new Texture(), lit);
      expect(material instanceof (lit ? MeshStandardMaterial : MeshBasicMaterial)).toBe(true);
      const shader = { vertexShader: '#include <common>\nvoid main() {\n#include <uv_vertex>\n}', fragmentShader: '', uniforms: {} };
      material.onBeforeCompile(shader as never, undefined as never);
      expect(shader.vertexShader).toContain('attribute vec4 uvRect;');
      expect(shader.vertexShader).toContain('vMapUv = uvRect.xy + vMapUv * uvRect.zw;');
    }
  });

  it('cellTexture clones the atlas with the cell offset and repeat', () => {
    const library = fakeLibrary(10);
    const t = cellTexture(library, 7, 'fit');
    const [u, v, w, h] = library.cell(7).fit;
    expect(t).not.toBe(library.atlases[0]);
    expect(t.source).toBe(library.atlases[0].source);
    expect([t.offset.x, t.offset.y, t.repeat.x, t.repeat.y]).toEqual([u, v, w, h]);
  });
});
```

`tests/unit/parts.test.ts`:
```ts
import { Box3, BoxGeometry, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEPTH, createCanvasBlock, cropTexture } from '../../src/stage/parts/canvas-block';
import { createStageMaterials } from '../../src/stage/parts/materials';
import { armAngles, createRobotArm } from '../../src/stage/parts/robot-arm';
import { fitBox } from '../../src/stage/parts/text-plane';
import { createThumbSculpture } from '../../src/stage/parts/thumb';
import { createVisitor } from '../../src/stage/parts/visitor';

const mats = createStageMaterials();

describe('canvas blocks', () => {
  it('crops wide and tall photos to the block aspect', () => {
    const wide = cropTexture(new Texture(), 2, 1);
    expect([wide.repeat.x, wide.repeat.y, wide.offset.x, wide.offset.y]).toEqual([0.5, 1, 0.25, 0]);
    const tall = cropTexture(new Texture(), 0.5, 1);
    expect([tall.repeat.x, tall.repeat.y, tall.offset.x, tall.offset.y]).toEqual([1, 0.5, 0, 0.25]);
  });

  it('builds a box with the photo on the front face only', () => {
    const texture = new Texture();
    const block = createCanvasBlock(texture, 1.5, 1.2, 0.8, mats.blockSide);
    const p = (block.geometry as BoxGeometry).parameters;
    expect([p.width, p.height, p.depth]).toEqual([1.2, 0.8, BLOCK_DEPTH]);
    const materials = block.material as MeshStandardMaterial[];
    expect(materials).toHaveLength(6);
    expect(materials[4].map).not.toBe(texture);
    expect(materials[4].map!.source).toBe(texture.source);
    expect(materials.filter((m) => m === mats.blockSide)).toHaveLength(5);
  });

  it('fitBox fits by the limiting side', () => {
    expect(fitBox(4, 8, 4)).toEqual({ width: 8, height: 2 });
    expect(fitBox(0.5, 8, 4)).toEqual({ width: 2, height: 4 });
  });
});

describe('visitors', () => {
  it('stand about 1.7–1.95 m tall in every pose and turn to their yaw', () => {
    for (const pose of [0, 1, 2] as const) {
      const g = createVisitor({ pos: [1, 0, 2], yaw: Math.PI, pose, dark: false, scale: 1 }, mats.visitor);
      g.updateMatrixWorld(true);
      const box = new Box3().setFromObject(g);
      expect(box.max.y - box.min.y).toBeGreaterThan(1.7);
      expect(box.max.y - box.min.y).toBeLessThan(1.95);
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(g.rotation.y).toBe(Math.PI);
    }
  });

  it('dark visitors are silhouettes', () => {
    const g = createVisitor({ pos: [0, 0, 0], yaw: 0, pose: 1, dark: true, scale: 1 }, mats.visitor);
    g.traverse((o) => {
      if ('material' in o) expect(o.material).toBe(mats.visitor.silhouette);
    });
  });
});

describe('sculpture and robots', () => {
  it('thumb sculpture is about 3 m tall and deterministic', () => {
    const a = createThumbSculpture(mats.sculpture, 4);
    const b = createThumbSculpture(mats.sculpture, 4);
    const box = new Box3().setFromObject(a);
    expect(box.max.y - box.min.y).toBeGreaterThan(2.8);
    expect(box.max.y - box.min.y).toBeLessThan(3.6);
    const pa = ((a.children[0] as never as { geometry: BoxGeometry }).geometry.getAttribute('position').array as Float32Array)[0];
    const pb = ((b.children[0] as never as { geometry: BoxGeometry }).geometry.getAttribute('position').array as Float32Array)[0];
    expect(pa).toBe(pb);
  });

  it('armAngles is deterministic and bounded', () => {
    expect(armAngles(3.2, 1.7)).toEqual(armAngles(3.2, 1.7));
    for (let t = 0; t < 60; t += 0.7) {
      const a = armAngles(t, 0.5);
      expect(a.grip).toBeGreaterThanOrEqual(0);
      expect(a.grip).toBeLessThanOrEqual(1);
      expect(Math.abs(a.base)).toBeLessThanOrEqual(0.55 + 1e-9);
    }
  });

  it('robot arms reach forward and stay above the floor', () => {
    const arm = createRobotArm(mats.robot);
    const p = new Vector3();
    for (let t = 0; t < 40; t += 0.5) {
      arm.pose(armAngles(t, 1.1));
      arm.group.updateMatrixWorld(true);
      arm.gripper.getWorldPosition(p);
      expect(p.z).toBeGreaterThan(1);
      expect(p.y).toBeGreaterThan(0.5);
      expect(p.y).toBeLessThan(3.4);
    }
  });
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `npx vitest run tests/unit/atlas-mesh.test.ts tests/unit/parts.test.ts`
Expected: FAIL（找不到 `stage/parts/*` 模組）

- [ ] **Step 4: 實作零件**

`src/stage/parts/atlas-mesh.ts`:
```ts
import {
  DoubleSide, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial,
  type BufferGeometry, type Color, type Material, type Matrix4, type Texture,
} from 'three';
import type { PhotoLibrary } from '../../assets/library';

/** A material that reads its map through a per-instance `uvRect` (u, v, w, h) into an atlas. */
export function createAtlasMaterial(atlas: Texture, lit: boolean, doubleSide = false): Material {
  const material = lit ? new MeshStandardMaterial({ map: atlas, roughness: 0.8 }) : new MeshBasicMaterial({ map: atlas });
  if (doubleSide) material.side = DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = uvRect.xy + vMapUv * uvRect.zw;\n#endif');
  };
  material.customProgramCacheKey = () => `atlas-${lit ? 'lit' : 'basic'}`;
  return material;
}

export interface AtlasInstance {
  photoIndex: number;
  matrix: Matrix4;
  color?: Color;
}

/** One InstancedMesh per atlas used by `items`; draw calls do not grow with the photo count. */
export function buildAtlasInstances(o: {
  geometry: BufferGeometry;
  library: PhotoLibrary;
  items: AtlasInstance[];
  material: (atlas: number) => Material;
  rect: 'fit' | 'square';
}): InstancedMesh[] {
  const groups = new Map<number, AtlasInstance[]>();
  for (const item of o.items) {
    const atlas = o.library.cell(item.photoIndex).atlas;
    const list = groups.get(atlas) ?? [];
    list.push(item);
    groups.set(atlas, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([atlas, list]) => {
      const geometry = o.geometry.clone();
      const rects = new Float32Array(list.length * 4);
      const mesh = new InstancedMesh(geometry, o.material(atlas), list.length);
      list.forEach((item, i) => {
        rects.set(o.library.cell(item.photoIndex)[o.rect], i * 4);
        mesh.setMatrixAt(i, item.matrix);
        if (item.color) mesh.setColorAt(i, item.color);
      });
      geometry.setAttribute('uvRect', new InstancedBufferAttribute(rects, 4));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.items = list;
      return mesh;
    });
}

/** A clone of the photo's atlas showing just its cell (shares the uploaded image). */
export function cellTexture(library: PhotoLibrary, index: number, rect: 'fit' | 'square'): Texture {
  const cell = library.cell(index);
  const texture = library.atlases[cell.atlas].clone();
  const [u, v, w, h] = cell[rect];
  texture.offset.set(u, v);
  texture.repeat.set(w, h);
  texture.needsUpdate = true;
  return texture;
}
```

`src/stage/parts/materials.ts`:
```ts
import { LineBasicMaterial, MeshStandardMaterial, type Material, type Texture } from 'three';
import { createAtlasMaterial } from './atlas-mesh';
import type { VisitorMaterials } from './visitor';

export interface StageMaterials {
  wall: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  skirting: MeshStandardMaterial;
  darkFloor: MeshStandardMaterial;
  darkWall: MeshStandardMaterial;
  blockSide: MeshStandardMaterial;
  plaque: MeshStandardMaterial;
  platform: MeshStandardMaterial;
  lightboxFrame: MeshStandardMaterial;
  monitorBody: MeshStandardMaterial;
  pedestal: MeshStandardMaterial;
  sculpture: MeshStandardMaterial;
  robot: { shell: MeshStandardMaterial; joint: MeshStandardMaterial; accent: MeshStandardMaterial };
  visitor: VisitorMaterials;
  nodeLine: LineBasicMaterial;
  starLine: LineBasicMaterial;
  /** Cached atlas material per (atlas texture, lit, double-sided). */
  atlas(texture: Texture, lit: boolean, doubleSide?: boolean): Material;
  dispose(): void;
}

export function createStageMaterials(): StageMaterials {
  const std = (color: number, roughness: number, extra: Partial<{ metalness: number; flatShading: boolean }> = {}) =>
    new MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const robot = { shell: std(0xe6e6e3, 0.45), joint: std(0x1b1b1d, 0.5), accent: std(0x6d6f73, 0.35, { metalness: 0.6 }) };
  const visitor: VisitorMaterials = {
    shirt: std(0x7d7f82, 0.9), pants: std(0x3a3b3e, 0.9), skin: std(0xb9a391, 0.8),
    hair: std(0x2a2522, 0.9), shoes: std(0x1c1c1c, 0.7), silhouette: std(0x060606, 1),
  };
  const shared = {
    wall: std(0xe9e8e4, 0.95),
    floor: std(0xcfccc5, 0.5),
    skirting: std(0xd9d7d1, 0.8),
    darkFloor: std(0x0b0b0c, 0.35, { metalness: 0.2 }),
    darkWall: std(0x070707, 1),
    blockSide: std(0x2b2b2b, 0.8),
    plaque: std(0xf7f7f5, 0.9),
    platform: std(0xdcdad4, 0.8),
    lightboxFrame: std(0x151515, 0.6),
    monitorBody: std(0x101010, 0.5),
    pedestal: std(0x2a2a2a, 0.7),
    sculpture: std(0x8f8f8f, 0.85, { flatShading: true }),
  };
  const nodeLine = new LineBasicMaterial({ color: 0x9aa7b8, transparent: true, opacity: 0.5 });
  const starLine = new LineBasicMaterial({ color: 0x3b6fb6, transparent: true, opacity: 0.35 });
  const atlasCache = new Map<string, Material>();
  const all: Material[] = [...Object.values(shared), ...Object.values(robot), ...Object.values(visitor), nodeLine, starLine];
  return {
    ...shared,
    robot,
    visitor,
    nodeLine,
    starLine,
    atlas(texture, lit, doubleSide = false) {
      const key = `${texture.uuid}:${lit}:${doubleSide}`;
      let m = atlasCache.get(key);
      if (!m) {
        m = createAtlasMaterial(texture, lit, doubleSide);
        atlasCache.set(key, m);
      }
      return m;
    },
    dispose() {
      all.forEach((m) => m.dispose());
      atlasCache.forEach((m) => m.dispose());
      atlasCache.clear();
    },
  };
}
```

`src/stage/parts/canvas-block.ts`:
```ts
import { BoxGeometry, Mesh, MeshStandardMaterial, type Material, type Texture } from 'three';

/** Gallery-wrapped canvas thickness (6 cm), as in the original. */
export const BLOCK_DEPTH = 0.06;

/** Clone of `src` cropped (cover) from `aspect` to `target` through the UV transform. */
export function cropTexture(src: Texture, aspect: number, target: number): Texture {
  const t = src.clone();
  if (aspect > target) {
    const w = target / aspect;
    t.repeat.set(w, 1);
    t.offset.set((1 - w) / 2, 0);
  } else {
    const h = aspect / target;
    t.repeat.set(1, h);
    t.offset.set(0, (1 - h) / 2);
  }
  t.needsUpdate = true;
  return t;
}

/** A frameless canvas: the photo on the +Z face, dark sides. Centre it DEPTH/2 in front of the wall. */
export function createCanvasBlock(texture: Texture, aspect: number, width: number, height: number, side: Material): Mesh {
  const front = new MeshStandardMaterial({ map: cropTexture(texture, aspect, width / height), roughness: 0.75 });
  front.userData.owned = true;
  front.userData.ownsMap = true;
  return new Mesh(new BoxGeometry(width, height, BLOCK_DEPTH), [side, side, side, side, front, side]);
}
```

`src/stage/parts/text-plane.ts`:
```ts
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { TextTexture } from '../../assets/texture-factory';

export function fitBox(aspect: number, maxW: number, maxH: number): { width: number; height: number } {
  return aspect >= maxW / maxH ? { width: maxW, height: maxW / aspect } : { width: maxH * aspect, height: maxH };
}

/** A transparent plane showing `text`, as large as fits in maxWidth × maxHeight. */
export function createTextPlane(text: TextTexture, maxWidth: number, maxHeight: number): Mesh {
  const size = fitBox(text.aspect, maxWidth, maxHeight);
  const material = new MeshBasicMaterial({ map: text.texture, transparent: true, depthWrite: false });
  material.userData.owned = true;
  material.userData.ownsMap = true;
  return new Mesh(new PlaneGeometry(size.width, size.height), material);
}
```

`src/stage/parts/visitor.ts`:
```ts
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry, type Material } from 'three';
import type { VisitorSpot } from '../layout';

export interface VisitorMaterials {
  shirt: Material;
  pants: Material;
  skin: Material;
  hair: Material;
  shoes: Material;
  silhouette: Material;
}

type Part = keyof Omit<VisitorMaterials, 'silhouette'>;

/** A standing gallery visitor (≈1.83 m), facing local +Z; pose 0 arms down, 1 arms crossed, 2 hands in pockets. */
export function createVisitor(spot: VisitorSpot, m: VisitorMaterials): Group {
  const group = new Group();
  group.name = 'visitor';
  const mat = (part: Part) => (spot.dark ? m.silhouette : m[part]);
  const add = (geometry: BufferGeometry, part: Part, x: number, y: number, z = 0): Mesh => {
    const mesh = new Mesh(geometry, mat(part));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const leg = new CapsuleGeometry(0.07, 0.74, 6, 12);
  add(leg, 'pants', -0.1, 0.51);
  add(leg, 'pants', 0.1, 0.51);
  const shoe = new BoxGeometry(0.11, 0.07, 0.26);
  add(shoe, 'shoes', -0.1, 0.035, 0.04);
  add(shoe, 'shoes', 0.1, 0.035, 0.04);
  add(new CapsuleGeometry(0.15, 0.1, 6, 16), 'pants', 0, 0.98).scale.set(1.25, 1, 0.8);
  add(new CapsuleGeometry(0.17, 0.42, 6, 16), 'shirt', 0, 1.3).scale.set(1.2, 1, 0.72);
  add(new CylinderGeometry(0.05, 0.055, 0.1, 12), 'skin', 0, 1.6);
  add(new SphereGeometry(0.105, 20, 16), 'skin', 0, 1.72).scale.set(0.92, 1.08, 1);
  add(new SphereGeometry(0.108, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), 'hair', 0, 1.735).scale.set(0.95, 1.05, 1.03);

  const upper = new CapsuleGeometry(0.05, 0.26, 6, 12);
  const fore = new CapsuleGeometry(0.045, 0.24, 6, 12);
  if (spot.pose === 0) {
    for (const s of [-1, 1]) {
      add(upper, 'shirt', s * 0.25, 1.33).rotation.z = s * 0.06;
      add(fore, 'shirt', s * 0.27, 1.03).rotation.z = s * 0.04;
    }
  } else if (spot.pose === 1) {
    for (const s of [-1, 1]) add(upper, 'shirt', s * 0.24, 1.33, 0.02).rotation.x = -0.2;
    add(fore, 'shirt', 0.03, 1.2, 0.15).rotation.z = Math.PI / 2;
    add(fore, 'shirt', -0.03, 1.16, 0.17).rotation.z = Math.PI / 2;
  } else {
    for (const s of [-1, 1]) {
      add(upper, 'shirt', s * 0.26, 1.33).rotation.z = s * 0.12;
      add(fore, 'shirt', s * 0.25, 1.06, -0.03).rotation.z = -s * 0.35;
    }
  }

  group.scale.setScalar(spot.scale);
  group.position.set(...spot.pos);
  group.rotation.y = spot.yaw;
  return group;
}
```

`src/stage/parts/thumb.ts`:
```ts
import { BoxGeometry, Group, Mesh, type Material } from 'three';
import { mulberry32 } from '../../util/rng';

/** Moves every vertex by a deterministic offset keyed on its position, so shared corners stay shared. */
function jitter(geometry: BoxGeometry, rnd: () => number, amount: number): void {
  const pos = geometry.getAttribute('position');
  const offsets = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let o = offsets.get(key);
    if (!o) {
      o = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount];
      offsets.set(key, o);
    }
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  pos.needsUpdate = true;
}

/** Low-poly "like" hand: cuff, fist, four curled fingers on +X, thumb up on −X. About 3.2 m tall. */
export function createThumbSculpture(material: Material, seed: number): Group {
  const rnd = mulberry32(seed);
  const group = new Group();
  group.name = 'thumb';
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => {
    const geometry = new BoxGeometry(w, h, d, 2, 2, 2);
    jitter(geometry, rnd, 0.07);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
  };
  block(1.1, 0.7, 0.9, 0, 0.35, 0);
  block(1.25, 1.2, 1.0, 0.05, 1.3, 0);
  for (let i = 0; i < 4; i++) block(0.5, 0.28, 0.9, 0.62, 0.86 + i * 0.3, 0.02);
  block(0.42, 0.9, 0.62, -0.28, 2.3, 0, 0.12);
  block(0.36, 0.5, 0.55, -0.34, 2.95, 0, 0.18);
  return group;
}
```

`src/stage/parts/robot-arm.ts`:
```ts
import { BoxGeometry, CylinderGeometry, Group, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';

export interface ArmAngles {
  base: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  /** 0 = open, 1 = closed. */
  grip: number;
}

/** Deterministic, slowly varying joint angles; the arm leans forward (+Z) over the platform. */
export function armAngles(t: number, phase: number): ArmAngles {
  return {
    base: 0.55 * Math.sin(0.33 * t + phase),
    shoulder: 0.45 + 0.25 * Math.sin(0.47 * t + phase * 1.3),
    elbow: 1.35 + 0.3 * Math.sin(0.61 * t + phase),
    wrist: 0.7 + 0.3 * Math.sin(0.83 * t + phase * 0.7),
    grip: 0.5 + 0.5 * Math.sin(1.05 * t + phase),
  };
}

export interface RobotArm {
  group: Group;
  gripper: Object3D;
  pose(angles: ArmAngles): void;
}

/** Industrial arm reaching along local +Z: base, turret, shoulder, upper arm, elbow, forearm, wrist, gripper. */
export function createRobotArm(m: { shell: Material; joint: Material; accent: Material }, held?: Object3D): RobotArm {
  const group = new Group();
  group.name = 'robot-arm';
  const mesh = (geometry: BufferGeometry, material: Material, parent: Object3D, x = 0, y = 0, z = 0): Mesh => {
    const out = new Mesh(geometry, material);
    out.position.set(x, y, z);
    parent.add(out);
    return out;
  };
  mesh(new CylinderGeometry(0.55, 0.65, 0.35, 32), m.joint, group, 0, 0.175);
  const turret = new Group();
  turret.position.y = 0.35;
  group.add(turret);
  mesh(new CylinderGeometry(0.42, 0.48, 0.55, 32), m.shell, turret, 0, 0.275);
  const shoulder = new Group();
  shoulder.position.y = 0.7;
  turret.add(shoulder);
  mesh(new CylinderGeometry(0.26, 0.26, 0.62, 24), m.joint, shoulder).rotation.z = Math.PI / 2;
  mesh(new BoxGeometry(0.34, 1.7, 0.4), m.shell, shoulder, 0, 0.85);
  const elbow = new Group();
  elbow.position.y = 1.7;
  shoulder.add(elbow);
  mesh(new CylinderGeometry(0.2, 0.2, 0.5, 24), m.joint, elbow).rotation.z = Math.PI / 2;
  mesh(new BoxGeometry(0.26, 1.45, 0.3), m.shell, elbow, 0, 0.72);
  mesh(new CylinderGeometry(0.05, 0.05, 1.2, 12), m.accent, elbow, 0.18, 0.7);
  const wrist = new Group();
  wrist.position.y = 1.45;
  elbow.add(wrist);
  mesh(new CylinderGeometry(0.15, 0.15, 0.28, 20), m.joint, wrist, 0, 0.14);
  const gripper = new Group();
  gripper.name = 'gripper';
  gripper.position.y = 0.3;
  wrist.add(gripper);
  const fingers = [-1, 1].map((s) => mesh(new BoxGeometry(0.05, 0.26, 0.12), m.accent, gripper, s * 0.1, 0.13));
  if (held) {
    held.position.set(0, 0.28, 0);
    gripper.add(held);
  }
  const pose = (a: ArmAngles) => {
    turret.rotation.y = a.base;
    shoulder.rotation.x = a.shoulder;
    elbow.rotation.x = a.elbow;
    wrist.rotation.x = a.wrist;
    fingers[0].position.x = -0.06 - 0.06 * a.grip;
    fingers[1].position.x = 0.06 + 0.06 * a.grip;
  };
  pose(armAngles(0, 0));
  return { group, gripper, pose };
}
```

- [ ] **Step 5: 執行確認通過**

Run: `npx vitest run tests/unit/atlas-mesh.test.ts tests/unit/parts.test.ts && npx tsc --noEmit`
Expected: PASS（atlas-mesh 4 passed；parts 8 passed）。若「robot arms reach forward」失敗，只調整 `armAngles` 的偏移量（0.45／1.35／0.7），不改門檻。

- [ ] **Step 6: 提交**

```bash
git add src/stage/parts tests/unit/fake-library.ts tests/unit/atlas-mesh.test.ts tests/unit/parts.test.ts
git commit -m "feat(v2): stage parts — atlas instancing, canvas blocks, visitors, thumb sculpture, robot arm"
```

---
### Task 7: 白牆布景與片尾 `stage/sets/wall.ts`、`ending.ts`

**Files:**
- Create: `src/stage/context.ts`, `src/stage/dispose.ts`, `src/stage/sets/common.ts`, `src/stage/sets/wall.ts`, `src/stage/sets/ending.ts`, `tests/unit/fake-stage.ts`
- Test: `tests/unit/stage-wall.test.ts`

**Interfaces:**
- Consumes: Task 2 layout 型別、Task 4 `PhotoLibrary`、Task 5 `StageTextureFactory`、`textUnits`、Task 6 全部零件
- Produces:
  - `context.ts`：`interface StageContent { library; name; subtitle; stamp; dateLabel; captions; led: { main: Texture; highlight: Texture }; mosaic: { colors: Float32Array; assignment: Int32Array } }`、`interface SetContext { storyboard; layout; content; tex; mats }`、`interface StageSet { ids: ShotId[]; scene: Scene; dark: boolean; update(t): void; dispose(): void }`、`spanOf(storyboard, id)`、`hiresOf(content, index): Texture`（缺少時丟出錯誤）、`localU(span, t)`
  - `dispose.ts`：`disposeScene(root)`
  - `sets/common.ts`：`whiteScene(color)`、`darkScene()`、`addDarkRoom(scene, mats, width, depth)`、`addVisitors(scene, spots, mats)`、`createPlaque(tex, label, number, at, mats)`
  - `buildWallSet(ctx, ids)`、`buildEndingSet(ctx, ids)`
  - 物件名稱：`'title'`、`'intro'`、`'exhibition'`、`'plaque:Portraits'`、`'plaque:Photos'`、`'portrait-block'`、`'photo-swarm'`、`'visitor'`、`'end-card'`、`'tagline'`

- [ ] **Step 1: 共用的假資料 `tests/unit/fake-stage.ts`**

```ts
import { Texture } from 'three';
import type { StageTextureFactory } from '../../src/assets/texture-factory';
import { buildStoryboard } from '../../src/plan/storyboard';
import type { SetContext, StageContent } from '../../src/stage/context';
import { MOSAIC, computeStageLayout } from '../../src/stage/layout';
import { createStageMaterials } from '../../src/stage/parts/materials';
import type { LengthMode } from '../../src/types';
import { fakeLibrary } from './fake-library';

export function fakeTextures(aspect = 4): StageTextureFactory {
  return {
    text: () => ({ texture: new Texture(), aspect }),
    glow: () => new Texture(),
    lightbox: () => new Texture(),
    colorBars: () => new Texture(),
  };
}

export function fakeContext(n = 12, lengthMode: LengthMode = 'auto', opts: { aspects?: number[]; hires?: boolean; textAspect?: number } = {}): SetContext {
  const aspects = opts.aspects ?? Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const storyboard = buildStoryboard({ photoCount: n, lengthMode, musicDuration: null });
  const layout = computeStageLayout({ storyboard, aspects, portraitIndex: 1 % n, seed: 3 });
  const library = fakeLibrary(n, aspects, opts.hires === false ? [] : layout.featured);
  const cells = MOSAIC.cols * MOSAIC.rows;
  const content: StageContent = {
    library,
    name: 'Tim Sparke',
    subtitle: '2026',
    stamp: '08:06:55 AM Monday November 28, 2011',
    dateLabel: '2011.11.28',
    captions: aspects.map((_, i) => `caption ${i}`),
    led: { main: new Texture(), highlight: new Texture() },
    mosaic: { colors: new Float32Array(cells * 3).fill(0.5), assignment: new Int32Array(cells).map((_, i) => i % n) },
  };
  return { storyboard, layout, content, tex: fakeTextures(opts.textAspect), mats: createStageMaterials() };
}
```

- [ ] **Step 2: 寫失敗的測試 `tests/unit/stage-wall.test.ts`**

```ts
import { InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildEndingSet } from '../../src/stage/sets/ending';
import { buildWallSet } from '../../src/stage/sets/wall';
import { WALL_SHOTS } from '../../src/stage/wall-run';
import { fakeContext } from './fake-stage';

const wallIds = (ctx: ReturnType<typeof fakeContext>) => ctx.storyboard.shots.map((s) => s.id).filter((id) => WALL_SHOTS.includes(id));
const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('wall set', () => {
  it('hangs the texts, the portraits, every photo and the visitors', () => {
    const ctx = fakeContext(20);
    const set = buildWallSet(ctx, wallIds(ctx));
    expect(set.dark).toBe(false);
    for (const name of ['title', 'intro', 'exhibition', 'plaque:Portraits', 'plaque:Photos']) expect(named(set.scene, name)).toHaveLength(1);
    expect(named(set.scene, 'portrait-block')).toHaveLength(ctx.layout.wall.portraits!.items.length);
    const swarm = named(set.scene, 'photo-swarm') as InstancedMesh[];
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(20);
    expect(named(set.scene, 'visitor')).toHaveLength(ctx.layout.wall.visitors.length);
  });

  it('spreads more than 256 photos over two atlas meshes', () => {
    const ctx = fakeContext(300);
    const swarm = named(buildWallSet(ctx, wallIds(ctx)).scene, 'photo-swarm') as InstancedMesh[];
    expect(swarm.map((m) => m.count)).toEqual([256, 44]);
  });

  it('the 30 s cut has no intro and no portraits', () => {
    const ctx = fakeContext(20, 30);
    const set = buildWallSet(ctx, wallIds(ctx));
    expect(named(set.scene, 'intro')).toHaveLength(0);
    expect(named(set.scene, 'plaque:Portraits')).toHaveLength(0);
    expect(named(set.scene, 'plaque:Photos')).toHaveLength(1);
  });

  it('keeps a very long name inside the exhibition box', () => {
    const ctx = fakeContext(10, 'auto', { textAspect: 30 });
    const [exhibition] = named(buildWallSet(ctx, wallIds(ctx)).scene, 'exhibition') as Mesh[];
    expect((exhibition.geometry as PlaneGeometry).parameters.width).toBeLessThanOrEqual(ctx.layout.wall.exhibition.width + 1e-9);
  });

  it('requires high-resolution textures for featured photos', () => {
    const ctx = fakeContext(12, 'auto', { hires: false });
    expect(() => buildWallSet(ctx, wallIds(ctx))).toThrow(/high-resolution/);
  });

  it('disposes without throwing', () => {
    const ctx = fakeContext(12);
    expect(() => buildWallSet(ctx, wallIds(ctx)).dispose()).not.toThrow();
  });
});

describe('ending set', () => {
  it('fades the end card and the tagline in', () => {
    const ctx = fakeContext(12);
    const set = buildEndingSet(ctx, ['ending']);
    const span = ctx.storyboard.shots.find((s) => s.id === 'ending')!;
    const card = named(set.scene, 'end-card')[0] as Mesh<PlaneGeometry, MeshBasicMaterial>;
    const tagline = named(set.scene, 'tagline')[0] as Mesh<PlaneGeometry, MeshBasicMaterial>;
    set.update(span.start);
    expect(card.material.opacity).toBe(0);
    expect(tagline.material.opacity).toBe(0);
    set.update((span.start + span.end) / 2);
    expect(card.material.opacity).toBe(1);
    expect(card.position.y).toBeCloseTo(0, 12);
    expect(tagline.material.opacity).toBeGreaterThan(0);
    expect(set.dark).toBe(true);
  });
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `npx vitest run tests/unit/stage-wall.test.ts`
Expected: FAIL（找不到 `src/stage/sets/*`）

- [ ] **Step 4: 實作 context、dispose、common**

`src/stage/context.ts`:
```ts
import type { Scene, Texture } from 'three';
import type { PhotoLibrary } from '../assets/library';
import type { StageTextureFactory } from '../assets/texture-factory';
import type { ShotId, ShotSpan, Storyboard } from '../types';
import { clamp } from '../util/math';
import type { StageLayout } from './layout';
import type { StageMaterials } from './parts/materials';

export interface StageContent {
  library: PhotoLibrary;
  name: string;
  subtitle: string;
  /** e.g. "08:06:55 AM Monday November 28, 2011" */
  stamp: string;
  /** e.g. "2026.09.28"; empty when no date was chosen. */
  dateLabel: string;
  captions: string[];
  led: { main: Texture; highlight: Texture };
  /** Portrait colour per mosaic cell (flat rgb, row 0 at the top) and the photo chosen for each cell. */
  mosaic: { colors: Float32Array; assignment: Int32Array };
}

export interface SetContext {
  storyboard: Storyboard;
  layout: StageLayout;
  content: StageContent;
  tex: StageTextureFactory;
  mats: StageMaterials;
}

export interface StageSet {
  ids: ShotId[];
  scene: Scene;
  /** Dark rooms get stronger bloom and softer AO. */
  dark: boolean;
  update(t: number): void;
  dispose(): void;
}

export function spanOf(storyboard: Storyboard, id: ShotId): ShotSpan {
  const span = storyboard.shots.find((s) => s.id === id);
  if (!span) throw new Error(`storyboard has no "${id}" shot`);
  return span;
}

export const localU = (span: ShotSpan, t: number): number => clamp((t - span.start) / (span.end - span.start), 0, 1);

export function hiresOf(content: StageContent, index: number): Texture {
  const texture = content.library.hires.get(index);
  if (!texture) throw new Error(`photo ${index} is featured but has no high-resolution texture`);
  return texture;
}
```

`src/stage/dispose.ts`:
```ts
import type { Material, MeshBasicMaterial, Object3D } from 'three';

/** Disposes every geometry under `root` and the materials (and maps) marked as owned. */
export function disposeScene(root: Object3D): void {
  root.traverse((obj) => {
    const node = obj as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    node.geometry?.dispose();
    if (!node.material) return;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!m.userData.owned) continue;
      if (m.userData.ownsMap) (m as MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}
```

`src/stage/sets/common.ts`:
```ts
import { BoxGeometry, Color, Group, HemisphereLight, Mesh, PlaneGeometry, Scene } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { Vec3 } from '../../types';
import type { VisitorSpot } from '../layout';
import type { StageMaterials } from '../parts/materials';
import { createTextPlane } from '../parts/text-plane';
import { createVisitor } from '../parts/visitor';

export function whiteScene(color: number): Scene {
  const scene = new Scene();
  scene.background = new Color(color);
  return scene;
}

export function darkScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(0x050505);
  scene.add(new HemisphereLight(0x404040, 0x000000, 0.35));
  return scene;
}

/** Dark reflective floor in front of z = 0 and a black back wall just behind it. */
export function addDarkRoom(scene: Scene, mats: StageMaterials, width: number, depth: number): void {
  const floor = new Mesh(new PlaneGeometry(width, depth), mats.darkFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, depth / 2 - 1);
  const back = new Mesh(new PlaneGeometry(width, 9), mats.darkWall);
  back.position.set(0, 4.5, -0.4);
  scene.add(floor, back);
}

export function addVisitors(scene: Scene, spots: VisitorSpot[], mats: StageMaterials): void {
  for (const spot of spots) scene.add(createVisitor(spot, mats.visitor));
}

/** The small room label the original hangs before each section ("Friends 1", "Photos 2"). */
export function createPlaque(tex: StageTextureFactory, label: string, number: number, at: Vec3, mats: StageMaterials): Group {
  const group = new Group();
  group.name = `plaque:${label}`;
  const backing = new Mesh(new BoxGeometry(0.42, 0.5, 0.015), mats.plaque);
  backing.position.z = 0.0075;
  const text = createTextPlane(
    tex.text({
      size: { width: 420, height: 500 },
      align: 'left',
      padding: 36,
      color: '#2a2a2a',
      lines: [
        { text: '■', px: 44, weight: 500 },
        { text: label, px: 44, weight: 500, family: 'grotesk' },
        { text: String(number), px: 36, weight: 500, family: 'grotesk' },
      ],
    }),
    0.4,
    0.48,
  );
  text.position.z = 0.016;
  group.add(backing, text);
  group.position.set(...at);
  return group;
}
```

- [ ] **Step 5: 實作 `src/stage/sets/wall.ts`**

```ts
import { BoxGeometry, DirectionalLight, HemisphereLight, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { ShotId } from '../../types';
import { hiresOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import type { CanvasItem } from '../layout';
import { buildAtlasInstances } from '../parts/atlas-mesh';
import { BLOCK_DEPTH, createCanvasBlock } from '../parts/canvas-block';
import { createTextPlane } from '../parts/text-plane';
import { WALL } from '../wall-run';
import { addVisitors, createPlaque, whiteScene } from './common';

export function buildWallSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats } = ctx;
  const w = layout.wall;
  const scene = whiteScene(0xe9e8e4);
  scene.add(new HemisphereLight(0xffffff, 0xd6d3cc, 1.25));
  const sun = new DirectionalLight(0xffffff, 0.55);
  sun.position.set(-6, 9, 12);
  scene.add(sun);

  const length = w.wallEnd - w.wallStart;
  const midX = (w.wallStart + w.wallEnd) / 2;
  const wall = new Mesh(new PlaneGeometry(length, WALL.height), mats.wall);
  wall.position.set(midX, WALL.height / 2, 0);
  const floor = new Mesh(new PlaneGeometry(length, 16), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, 8);
  const skirting = new Mesh(new BoxGeometry(length, 0.06, 0.02), mats.skirting);
  skirting.position.set(midX, 0.03, 0.01);
  scene.add(wall, floor, skirting);

  const title = createTextPlane(
    tex.text({
      color: '#1f1f1f',
      lineGap: 0.5,
      padding: 24,
      lines: [
        { text: 'The Museum of Me', px: 120, weight: 500, family: 'serif' },
        { text: 'Create and explore a visual archive of your social life.', px: 30, weight: 400, spacing: 1 },
      ],
    }),
    w.title.width,
    w.title.height,
  );
  title.name = 'title';
  title.position.set(w.title.center[0], w.title.center[1], 0.01);
  scene.add(title);

  const block = (item: CanvasItem, name: string) => {
    const mesh = createCanvasBlock(hiresOf(content, item.photoIndex), content.library.aspects[item.photoIndex], item.width, item.height, mats.blockSide);
    mesh.name = name;
    mesh.position.set(item.center[0], item.center[1], BLOCK_DEPTH / 2);
    scene.add(mesh);
  };

  if (w.intro) {
    block(w.intro.avatar, 'intro-avatar');
    const intro = createTextPlane(
      tex.text({
        align: 'left',
        color: '#262626',
        lineGap: 0.3,
        padding: 16,
        lines: [
          { text: 'This exhibition is a journey of', px: 64, weight: 400, family: 'serif' },
          { text: `visualization that explores who ${content.name} is.`, px: 64, weight: 400, family: 'serif' },
        ],
      }),
      w.intro.width,
      w.intro.height,
    );
    intro.name = 'intro';
    intro.position.set(w.intro.center[0], w.intro.center[1], 0.01);
    scene.add(intro);
  }

  const exhibition = createTextPlane(
    tex.text({
      align: 'left',
      color: '#1b1b1b',
      lineGap: 0.04,
      padding: 20,
      lines: [
        { text: content.name.toUpperCase(), px: 200, weight: 800, family: 'grotesk' },
        { text: 'EXHIBITION', px: 200, weight: 800, family: 'grotesk' },
        { text: content.stamp, px: 64, weight: 500, family: 'grotesk' },
      ],
    }),
    w.exhibition.width,
    w.exhibition.height,
  );
  exhibition.name = 'exhibition';
  exhibition.position.set(w.exhibition.center[0], w.exhibition.center[1], 0.01);
  scene.add(exhibition);

  let section = 1;
  if (w.portraits) {
    scene.add(createPlaque(tex, 'Portraits', section++, w.portraits.label, mats));
    for (const item of w.portraits.items) block(item, 'portrait-block');
  }
  scene.add(createPlaque(tex, 'Photos', section, w.photos.label, mats));
  const matrix = (item: CanvasItem) =>
    new Matrix4().compose(new Vector3(item.center[0], item.center[1], BLOCK_DEPTH / 2), new Quaternion(), new Vector3(item.width, item.height, 1));
  const swarm = buildAtlasInstances({
    geometry: new BoxGeometry(1, 1, BLOCK_DEPTH),
    library: content.library,
    items: w.photos.items.map((item) => ({ photoIndex: item.photoIndex, matrix: matrix(item) })),
    material: (atlas) => mats.atlas(content.library.atlases[atlas], true),
    rect: 'fit',
  });
  for (const mesh of swarm) {
    mesh.name = 'photo-swarm';
    scene.add(mesh);
  }

  addVisitors(scene, w.visitors, mats);
  return { ids, scene, dark: false, update: () => {}, dispose: () => disposeScene(scene) };
}
```

- [ ] **Step 6: 實作 `src/stage/sets/ending.ts`**

```ts
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { ShotId } from '../../types';
import { smoothstep } from '../../util/math';
import { localU, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { textUnits } from '../parts/led';
import { createTextPlane } from '../parts/text-plane';
import { darkScene } from './common';

export function buildEndingSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { content, tex, storyboard } = ctx;
  const span = spanOf(storyboard, 'ending');
  const scene = darkScene();
  const name = content.name.toUpperCase();
  const namePx = Math.min(150, Math.floor(1400 / Math.max(1, textUnits(name) * 0.6)));
  const card = tex.text({
    size: { width: 1760, height: 1080 },
    background: '#f4f4f2',
    align: 'left',
    padding: 150,
    lineGap: 0.12,
    lines: [
      { text: 'The Museum of Me', px: 84, weight: 500, family: 'serif', color: '#1d1d1d' },
      { text: name, px: namePx, weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: 'EXHIBITION', px: 150, weight: 800, family: 'grotesk', color: '#1d1d1d' },
      { text: content.dateLabel, px: 40, weight: 500, family: 'grotesk', color: '#666666' },
    ],
  });
  const cardMaterial = new MeshBasicMaterial({ map: card.texture, transparent: true, opacity: 0 });
  cardMaterial.userData.owned = true;
  cardMaterial.userData.ownsMap = true;
  const cardMesh = new Mesh(new PlaneGeometry(4.4, 2.7), cardMaterial);
  cardMesh.name = 'end-card';
  cardMesh.rotation.set(-0.12, 0.22, 0);
  const tagline = createTextPlane(
    tex.text({ color: '#e8e8e8', lines: [{ text: 'Create and explore a visual archive of your memories.', px: 36, weight: 300 }] }),
    4.6,
    0.3,
  );
  tagline.name = 'tagline';
  tagline.position.y = -1.95;
  const taglineMaterial = tagline.material as MeshBasicMaterial;
  taglineMaterial.opacity = 0;
  scene.add(cardMesh, tagline);

  return {
    ids,
    scene,
    dark: true,
    update(t) {
      const u = localU(span, t);
      const a = smoothstep(0, 0.35, u);
      cardMaterial.opacity = a;
      cardMesh.position.y = -0.25 * (1 - a);
      taglineMaterial.opacity = smoothstep(0.25, 0.55, u);
    },
    dispose: () => disposeScene(scene),
  };
}
```

- [ ] **Step 7: 執行確認通過**

Run: `npx vitest run tests/unit/stage-wall.test.ts && npx tsc --noEmit`
Expected: PASS（7 passed）

- [ ] **Step 8: 提交**

```bash
git add src/stage tests/unit/fake-stage.ts tests/unit/stage-wall.test.ts
git commit -m "feat(v2): white wall set (title, intro, exhibition, portraits, photo swarm) and end card"
```

---

### Task 8: 暗房布景 `moments`、`words`、`likes`、`videos`

**Files:**
- Create: `src/stage/sets/moments.ts`, `src/stage/sets/words.ts`, `src/stage/sets/likes.ts`, `src/stage/sets/videos.ts`
- Modify: `src/stage/parts/atlas-mesh.ts`（新增 `cellTextureCropped`）
- Test: `tests/unit/stage-dark.test.ts`

**Interfaces:**
- Consumes: Task 7 的 context／common／dispose、Task 6 零件、Task 4 `UvRect`
- Produces: `buildMomentsSet`、`buildWordsSet`、`buildLikesSet`、`buildVideosSet`（皆為 `(ctx, ids) => StageSet`）；`coverRect(aspect, target): UvRect`、`videoPanelRect(col, row, cols, rows, cover, zoom, pan): UvRect`；`cellTextureCropped(library, index, targetAspect): Texture`；物件名稱 `'lightbox'`、`'led-main'`、`'led-highlight'`、`'thumb'`、`'screen'`、`'video-panel'`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/stage-dark.test.ts`**

```ts
import { Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { VIDEO_WALL } from '../../src/stage/layout';
import { cellTextureCropped } from '../../src/stage/parts/atlas-mesh';
import { buildLikesSet } from '../../src/stage/sets/likes';
import { buildMomentsSet } from '../../src/stage/sets/moments';
import { coverRect, buildVideosSet, videoPanelRect } from '../../src/stage/sets/videos';
import { buildWordsSet } from '../../src/stage/sets/words';
import { fakeLibrary } from './fake-library';
import { fakeContext } from './fake-stage';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const opacity = (o: Object3D) => ((o as Mesh).material as MeshBasicMaterial).opacity;

describe('dark rooms', () => {
  it('moments: one glowing light box per chosen photo', () => {
    const ctx = fakeContext(20);
    const set = buildMomentsSet(ctx, ['moments']);
    expect(set.dark).toBe(true);
    expect(named(set.scene, 'lightbox')).toHaveLength(ctx.layout.moments.boxes.length);
    expect(named(set.scene, 'visitor')).toHaveLength(2);
  });

  it('words: the highlight word takes over during the second half', () => {
    const ctx = fakeContext(20);
    const set = buildWordsSet(ctx, ['words']);
    const span = ctx.storyboard.shots.find((s) => s.id === 'words')!;
    const d = span.end - span.start;
    const [main] = named(set.scene, 'led-main');
    const [highlight] = named(set.scene, 'led-highlight');
    set.update(span.start + 0.3 * d);
    expect(opacity(highlight)).toBe(0);
    expect(opacity(main)).toBe(1);
    set.update(span.start + 0.9 * d);
    expect(opacity(highlight)).toBe(1);
    expect(opacity(main)).toBeCloseTo(0.15, 9);
  });

  it('likes: sculpture, 28 screens (some colour bars) and a spot light', () => {
    const ctx = fakeContext(20);
    const set = buildLikesSet(ctx, ['likes']);
    expect(named(set.scene, 'thumb')).toHaveLength(1);
    const screens = named(set.scene, 'screen') as Mesh[];
    expect(screens).toHaveLength(28);
    const barsMaterial = screens.find((s, i) => ctx.layout.likes.monitors[i].bars)!.material;
    expect(screens.filter((s) => s.material === barsMaterial).length).toBe(ctx.layout.likes.monitors.filter((m) => m.bars).length);
  });

  it('videos: 12 panels that pan across one photo over time', () => {
    const ctx = fakeContext(20);
    const set = buildVideosSet(ctx, ['videos']);
    const span = ctx.storyboard.shots.find((s) => s.id === 'videos')!;
    const panels = named(set.scene, 'video-panel') as Mesh<never, MeshBasicMaterial>[];
    expect(panels).toHaveLength(VIDEO_WALL.cols * VIDEO_WALL.rows);
    set.update(span.start);
    const before = panels[0].material.map!.offset.x;
    set.update(span.end);
    expect(panels[0].material.map!.offset.x).not.toBe(before);
    expect(() => set.dispose()).not.toThrow();
  });
});

describe('video wall maths', () => {
  it('coverRect crops to the target aspect', () => {
    expect(coverRect(2, 1)).toEqual([0.25, 0, 0.5, 1]);
    expect(coverRect(0.5, 1)).toEqual([0, 0.25, 1, 0.5]);
  });

  it('panels tile the zoomed, panned rect without gaps and stay inside the cover rect', () => {
    const cover = coverRect(1.5, 2.2);
    for (const [zoom, pan] of [[1, 0], [1.12, -0.04], [1.12, 0.04]] as const) {
      const rects = [0, 1, 2, 3].map((col) => videoPanelRect(col, 0, 4, 3, cover, zoom, pan));
      for (let i = 1; i < 4; i++) expect(rects[i][0]).toBeCloseTo(rects[i - 1][0] + rects[i - 1][2], 12);
      const top = videoPanelRect(0, 0, 4, 3, cover, zoom, pan);
      const bottom = videoPanelRect(0, 2, 4, 3, cover, zoom, pan);
      expect(top[1]).toBeGreaterThan(bottom[1]);
      expect(rects[0][0]).toBeGreaterThanOrEqual(cover[0] - 1e-12);
      expect(rects[3][0] + rects[3][2]).toBeLessThanOrEqual(cover[0] + cover[2] + 1e-12);
    }
  });

  it('cellTextureCropped crops the photo cell to the screen aspect', () => {
    const library = fakeLibrary(3, [2, 1, 0.5]);
    const t = cellTextureCropped(library, 0, 1);
    const [, , w, h] = library.cell(0).fit;
    expect(t.repeat.x).toBeCloseTo(w / 2, 12);
    expect(t.repeat.y).toBeCloseTo(h, 12);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/stage-dark.test.ts`
Expected: FAIL（找不到 `src/stage/sets/moments` 等模組）

- [ ] **Step 3: 在 `src/stage/parts/atlas-mesh.ts` 檔尾新增**

```ts

/** Like `cellTexture(…, 'fit')`, then cropped (cover) to `target` aspect. */
export function cellTextureCropped(library: PhotoLibrary, index: number, target: number): Texture {
  const cell = library.cell(index);
  const aspect = library.aspects[index];
  let [u, v, w, h] = cell.fit;
  if (aspect > target) {
    const nw = (w * target) / aspect;
    u += (w - nw) / 2;
    w = nw;
  } else {
    const nh = (h * aspect) / target;
    v += (h - nh) / 2;
    h = nh;
  }
  const texture = library.atlases[cell.atlas].clone();
  texture.offset.set(u, v);
  texture.repeat.set(w, h);
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 4: 實作四個暗房布景**

`src/stage/sets/moments.ts`:
```ts
import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight } from 'three';
import type { ImageLike } from '../../assets/texture-factory';
import type { ShotId } from '../../types';
import { hiresOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { addDarkRoom, addVisitors, darkScene } from './common';

export function buildMomentsSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats } = ctx;
  const scene = darkScene();
  addDarkRoom(scene, mats, 34, 16);
  for (const box of layout.moments.boxes) {
    const photo = hiresOf(content, box.photoIndex);
    const face = tex.lightbox(photo.image as ImageLike, [
      `NO. ${String(box.photoIndex + 1).padStart(3, '0')}`,
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
    scene.add(frame, panel, light);
  }
  addVisitors(scene, layout.moments.visitors, mats);
  return { ids, scene, dark: true, update: () => {}, dispose: () => disposeScene(scene) };
}
```

`src/stage/sets/words.ts`:
```ts
import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { ShotId } from '../../types';
import { smoothstep } from '../../util/math';
import { spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { addDarkRoom, addVisitors, darkScene } from './common';

export function buildWordsSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, mats, storyboard } = ctx;
  const span = spanOf(storyboard, 'words');
  const w = layout.words;
  const scene = darkScene();
  addDarkRoom(scene, mats, 34, 16);
  const backing = new Mesh(new BoxGeometry(w.width + 0.4, w.height + 0.4, 0.2), mats.darkWall);
  backing.position.set(w.center[0], w.center[1], -0.1);
  const panel = (map: MeshBasicMaterial['map'], name: string, z: number, opacity: number) => {
    const material = new MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false });
    material.color.setScalar(1.6);
    material.userData.owned = true;
    const mesh = new Mesh(new PlaneGeometry(w.width, w.height), material);
    mesh.name = name;
    mesh.position.set(w.center[0], w.center[1], z);
    return mesh;
  };
  const main = panel(content.led.main, 'led-main', 0.01, 1);
  const highlight = panel(content.led.highlight, 'led-highlight', 0.012, 0);
  scene.add(backing, main, highlight);
  addVisitors(scene, w.visitors, mats);
  const d = span.end - span.start;
  return {
    ids,
    scene,
    dark: true,
    update(t) {
      const h = smoothstep(span.start + 0.6 * d, span.start + 0.75 * d, t);
      (highlight.material as MeshBasicMaterial).opacity = h;
      (main.material as MeshBasicMaterial).opacity = 1 - 0.85 * h;
    },
    dispose: () => disposeScene(scene),
  };
}
```

`src/stage/sets/likes.ts`:
```ts
import { BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight } from 'three';
import type { ShotId } from '../../types';
import type { SetContext, StageSet } from '../context';
import { disposeScene } from '../dispose';
import { cellTextureCropped } from '../parts/atlas-mesh';
import { createThumbSculpture } from '../parts/thumb';
import { addDarkRoom, addVisitors, darkScene } from './common';

export function buildLikesSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats } = ctx;
  const scene = darkScene();
  addDarkRoom(scene, mats, 34, 18);
  const back = new Mesh(new PlaneGeometry(34, 9), mats.darkWall);
  back.position.set(0, 4.5, -5.3);
  scene.add(back);

  const pedestal = new Mesh(new CylinderGeometry(1.7, 1.8, 0.55, 48), mats.pedestal);
  pedestal.position.y = 0.275;
  const thumb = createThumbSculpture(mats.sculpture, 7);
  thumb.position.y = 0.55;
  thumb.rotation.y = -0.35;
  const spot = new SpotLight(0xffffff, 80, 20, 0.5, 0.6, 1.5);
  spot.position.set(1.5, 9, 3);
  spot.target.position.set(0, 1.5, 0);
  scene.add(pedestal, thumb, spot, spot.target);

  const barsMaterial = new MeshBasicMaterial({ map: tex.colorBars() });
  barsMaterial.color.setScalar(1.3);
  barsMaterial.userData.owned = true;
  barsMaterial.userData.ownsMap = true;
  for (const monitor of layout.likes.monitors) {
    const body = new Mesh(new BoxGeometry(monitor.width + 0.06, monitor.height + 0.06, 0.1), mats.monitorBody);
    body.position.set(monitor.center[0], monitor.center[1], monitor.center[2] + 0.05);
    let material = barsMaterial;
    if (!monitor.bars) {
      material = new MeshBasicMaterial({ map: cellTextureCropped(content.library, monitor.photoIndex, monitor.width / monitor.height) });
      material.color.setScalar(1.4);
      material.userData.owned = true;
      material.userData.ownsMap = true;
    }
    const screen = new Mesh(new PlaneGeometry(monitor.width, monitor.height), material);
    screen.name = 'screen';
    screen.position.set(monitor.center[0], monitor.center[1], monitor.center[2] + 0.101);
    scene.add(body, screen);
  }
  addVisitors(scene, layout.likes.visitors, mats);
  return { ids, scene, dark: true, update: () => {}, dispose: () => disposeScene(scene) };
}
```

`src/stage/sets/videos.ts`:
```ts
import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { UvRect } from '../../assets/atlas';
import type { ShotId } from '../../types';
import { clamp, lerp } from '../../util/math';
import { hiresOf, localU, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { VIDEO_WALL } from '../layout';
import { addDarkRoom, addVisitors, darkScene } from './common';

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

export function buildVideosSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, mats, storyboard } = ctx;
  const span = spanOf(storyboard, 'videos');
  const v = layout.videos;
  const { cols, rows, panelWidth, panelHeight, gap, centerY } = VIDEO_WALL;
  const scene = darkScene();
  addDarkRoom(scene, mats, 30, 16);
  const wallW = cols * panelWidth + (cols - 1) * gap;
  const wallH = rows * panelHeight + (rows - 1) * gap;
  const backing = new Mesh(new BoxGeometry(wallW + 0.3, wallH + 0.3, 0.12), mats.darkWall);
  backing.position.set(0, centerY, -0.06);
  scene.add(backing);

  const photo = hiresOf(content, v.photoIndex);
  const cover = coverRect(content.library.aspects[v.photoIndex], wallW / wallH);
  const panels = v.panels.map((p) => {
    const material = new MeshBasicMaterial({ map: photo.clone() });
    material.map!.needsUpdate = true;
    material.color.setScalar(1.35);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const mesh = new Mesh(new PlaneGeometry(p.width, p.height), material);
    mesh.name = 'video-panel';
    mesh.position.set(p.center[0], p.center[1], 0.01);
    scene.add(mesh);
    return { panel: p, material };
  });
  const update = (t: number) => {
    const u = localU(span, t);
    const zoom = lerp(1, 1.12, u);
    const pan = lerp(-0.04, 0.04, u);
    for (const { panel, material } of panels) {
      const [ru, rv, rw, rh] = videoPanelRect(panel.col, panel.row, cols, rows, cover, zoom, pan);
      material.map!.offset.set(ru, rv);
      material.map!.repeat.set(rw, rh);
    }
  };
  update(span.start);
  addVisitors(scene, v.visitors, mats);
  return { ids, scene, dark: true, update, dispose: () => disposeScene(scene) };
}
```

- [ ] **Step 5: 執行確認通過**

Run: `npx vitest run tests/unit/stage-dark.test.ts && npx tsc --noEmit`
Expected: PASS（7 passed）

- [ ] **Step 6: 提交**

```bash
git add src/stage tests/unit/stage-dark.test.ts
git commit -m "feat(v2): dark rooms — light boxes, LED word wall, like sculpture with monitors, video wall"
```

---

### Task 9: 機器手臂、馬賽克、網絡與舞台組裝

**Files:**
- Create: `src/stage/sets/robots.ts`, `src/stage/sets/mosaic.ts`, `src/stage/sets/network.ts`, `src/stage/build.ts`
- Test: `tests/unit/stage-build.test.ts`

**Interfaces:**
- Consumes: Task 7、8 的所有布景；Task 6 `armAngles`, `createRobotArm`, `buildAtlasInstances`, `cellTexture`, `cropTexture`
- Produces: `buildRobotsSet`、`buildMosaicSet`、`buildNetworkSet`；`interface Stage { sets: StageSet[]; setFor(id: ShotId): StageSet; dispose(): void }`、`buildStage(storyboard, layout, content, tex): Stage`；物件名稱 `'robot-arm'`、`'photo-tiles'`、`'floaters'`、`'mosaic'`、`'mosaic-tiles'`、`'mosaic-overlay'`、`'network'`、`'network-nodes'`、`'stars'`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/stage-build.test.ts`**

```ts
import { InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildStage } from '../../src/stage/build';
import { MOSAIC, ROBOT_TILES } from '../../src/stage/layout';
import { fakeContext } from './fake-stage';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const instances = (root: Object3D, name: string) => (named(root, name) as InstancedMesh[]).reduce((s, m) => s + m.count, 0);

function stageFor(n: number, mode: Parameters<typeof fakeContext>[1] = 'auto') {
  const ctx = fakeContext(n, mode);
  return { ctx, stage: buildStage(ctx.storyboard, ctx.layout, ctx.content, ctx.tex) };
}

describe('buildStage', () => {
  it('builds the wall set plus one set per remaining shot', () => {
    const { stage } = stageFor(12);
    expect(stage.sets.map((s) => s.ids)).toEqual([
      ['title', 'intro', 'exhibition', 'portraits', 'photos'],
      ['moments'], ['words'], ['likes'], ['videos'], ['robots'], ['mosaic'], ['network'], ['ending'],
    ]);
    expect(stage.setFor('intro')).toBe(stage.setFor('title'));
    expect(stage.sets.map((s) => s.dark)).toEqual([false, true, true, true, true, false, true, true, true]);
  });

  it('the 30 s cut builds only its sets', () => {
    const { stage } = stageFor(12, 30);
    expect(stage.sets.map((s) => s.ids)).toEqual([['title', 'exhibition', 'photos'], ['mosaic'], ['ending']]);
    expect(() => stage.setFor('robots')).toThrow();
  });

  it('robots: tiles carpet the platform, photos float and four arms move', () => {
    const { ctx, stage } = stageFor(40);
    const set = stage.setFor('robots');
    expect(instances(set.scene, 'photo-tiles')).toBe(ROBOT_TILES.cols * ROBOT_TILES.rows);
    expect(instances(set.scene, 'floaters')).toBe(ctx.layout.robots.floaters.length);
    const arms = named(set.scene, 'robot-arm');
    expect(arms).toHaveLength(4);
    const span = ctx.storyboard.shots.find((s) => s.id === 'robots')!;
    const gripper = () => { set.scene.updateMatrixWorld(true); return arms[0].getObjectByName('gripper')!.getWorldPosition(new Vector3()).toArray(); };
    set.update(span.start + 1);
    const a = gripper();
    set.update(span.start + 5);
    expect(gripper()).not.toEqual(a);
    set.update(span.start + 1);
    expect(gripper()).toEqual(a);
    const floaters = named(set.scene, 'floaters')[0] as InstancedMesh;
    const m = new Matrix4();
    floaters.getMatrixAt(0, m);
    const before = m.elements[13];
    set.update(span.start + 3);
    floaters.getMatrixAt(0, m);
    expect(m.elements[13]).not.toBe(before);
  });

  it('mosaic: one tile per cell, then shrinks and fades to the portrait', () => {
    const { ctx, stage } = stageFor(12);
    const set = stage.setFor('mosaic');
    expect(instances(set.scene, 'mosaic-tiles')).toBe(MOSAIC.cols * MOSAIC.rows);
    const span = ctx.storyboard.shots.find((s) => s.id === 'mosaic')!;
    const overlay = named(set.scene, 'mosaic-overlay')[0] as Mesh<never, MeshBasicMaterial>;
    const group = named(set.scene, 'mosaic')[0];
    set.update(span.start);
    expect(overlay.material.opacity).toBe(0);
    expect(group.scale.x).toBe(1);
    set.update(span.end);
    expect(overlay.material.opacity).toBe(1);
    expect(group.scale.x).toBeCloseTo(0.35, 9);
  });

  it('network: photo spheres, stars and a slow rotation', () => {
    const { ctx, stage } = stageFor(30);
    const set = stage.setFor('network');
    expect(instances(set.scene, 'network-nodes')).toBe(ctx.layout.network.nodes.length);
    expect(named(set.scene, 'stars')).toHaveLength(1);
    const span = ctx.storyboard.shots.find((s) => s.id === 'network')!;
    const group = named(set.scene, 'network')[0];
    set.update(span.start);
    expect(group.rotation.y).toBe(0);
    set.update(span.start + 10);
    expect(group.rotation.y).toBeCloseTo(0.6, 9);
  });

  it('updates every set at any time without throwing, then disposes', () => {
    const { ctx, stage } = stageFor(8);
    for (let t = 0; t <= ctx.storyboard.total; t += 1.3) for (const set of stage.sets) set.update(t);
    expect(() => stage.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/stage-build.test.ts`
Expected: FAIL（找不到 `src/stage/build`）

- [ ] **Step 3: 實作 `src/stage/sets/robots.ts`**

```ts
import {
  BoxGeometry, DirectionalLight, DoubleSide, Euler, HemisphereLight, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, Quaternion, Vector3, type InstancedMesh,
} from 'three';
import type { ShotId } from '../../types';
import type { SetContext, StageSet } from '../context';
import { disposeScene } from '../dispose';
import { ROBOT_TILES, type RobotsLayout } from '../layout';
import { buildAtlasInstances, cellTexture, type AtlasInstance } from '../parts/atlas-mesh';
import { armAngles, createRobotArm } from '../parts/robot-arm';
import { whiteScene } from './common';

type Floater = RobotsLayout['floaters'][number];

function floaterMatrix(f: Floater, t: number): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(0.2 * Math.sin(0.3 * t + f.phase), f.phase + 0.1 * t, 0));
  return new Matrix4().compose(new Vector3(f.pos[0], f.pos[1] + 0.15 * Math.sin(0.4 * t + f.phase), f.pos[2]), q, new Vector3(f.size, f.size, 1));
}

export function buildRobotsSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, mats } = ctx;
  const r = layout.robots;
  const lib = content.library;
  const scene = whiteScene(0xefeeea);
  scene.add(new HemisphereLight(0xffffff, 0xd9d6cf, 1.3));
  const sun = new DirectionalLight(0xffffff, 0.7);
  sun.position.set(8, 12, 6);
  scene.add(sun);

  const floor = new Mesh(new PlaneGeometry(40, 30), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  const back = new Mesh(new PlaneGeometry(40, 12), mats.wall);
  back.position.set(0, 6, -12);
  const platform = new Mesh(new BoxGeometry(r.platform.width, r.platform.height, r.platform.depth), mats.platform);
  platform.position.y = r.platform.height / 2;
  scene.add(floor, back, platform);

  const tiles = buildAtlasInstances({
    geometry: new BoxGeometry(ROBOT_TILES.size, 0.01, ROBOT_TILES.size),
    library: lib,
    items: r.tiles.map((tile) => ({
      photoIndex: tile.photoIndex,
      matrix: new Matrix4().compose(
        new Vector3(tile.x, r.platform.height + 0.005, tile.z),
        new Quaternion().setFromEuler(new Euler(0, tile.rotation, 0)),
        new Vector3(1, 1, 1),
      ),
    })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], true),
    rect: 'square',
  });
  for (const mesh of tiles) {
    mesh.name = 'photo-tiles';
    scene.add(mesh);
  }

  const floaters = buildAtlasInstances({
    geometry: new PlaneGeometry(1, 1),
    library: lib,
    items: r.floaters.map((f) => ({ photoIndex: f.photoIndex, matrix: floaterMatrix(f, 0), floater: f })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], false, true),
    rect: 'fit',
  });
  for (const mesh of floaters) {
    mesh.name = 'floaters';
    scene.add(mesh);
  }

  const arms = r.arms.map((spec, i) => {
    const heldMaterial = new MeshBasicMaterial({ map: cellTexture(lib, r.floaters[i % r.floaters.length].photoIndex, 'square'), side: DoubleSide });
    heldMaterial.userData.owned = true;
    heldMaterial.userData.ownsMap = true;
    const held = new Mesh(new PlaneGeometry(0.28, 0.28), heldMaterial);
    held.rotation.x = -Math.PI / 2;
    const arm = createRobotArm(mats.robot, held);
    arm.group.position.set(...spec.pos);
    arm.group.rotation.y = spec.yaw;
    scene.add(arm.group);
    return { arm, phase: spec.phase };
  });

  const update = (t: number) => {
    for (const { arm, phase } of arms) arm.pose(armAngles(t, phase));
    for (const mesh of floaters as InstancedMesh[]) {
      (mesh.userData.items as (AtlasInstance & { floater: Floater })[]).forEach((item, i) => mesh.setMatrixAt(i, floaterMatrix(item.floater, t)));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);
  return { ids, scene, dark: false, update, dispose: () => disposeScene(scene) };
}
```

- [ ] **Step 4: 實作 `src/stage/sets/mosaic.ts`**

```ts
import { Color, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { ShotId } from '../../types';
import { clamp, lerp, smoothstep } from '../../util/math';
import { hiresOf, localU, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { buildAtlasInstances, type AtlasInstance } from '../parts/atlas-mesh';
import { cropTexture } from '../parts/canvas-block';
import { darkScene } from './common';

/** Multiplier that brings a photo's average colour to the cell colour (softened, clamped). */
function tint(cell: number, photo: number): number {
  return 1 + (clamp(cell / Math.max(photo, 0.04), 0, 3) - 1) * 0.9;
}

export function buildMosaicSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, storyboard } = ctx;
  const span = spanOf(storyboard, 'mosaic');
  const { cols, rows, tile } = layout.mosaic;
  const lib = content.library;
  const { colors, assignment } = content.mosaic;
  const scene = darkScene();
  scene.background = new Color(0x000000);
  const group = new Group();
  group.name = 'mosaic';
  scene.add(group);

  const items: AtlasInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const p = assignment[i];
      const pc = lib.colors[p];
      items.push({
        photoIndex: p,
        matrix: new Matrix4().compose(
          new Vector3((c - (cols - 1) / 2) * tile, ((rows - 1) / 2 - r) * tile, 0),
          new Quaternion(),
          new Vector3(tile * 0.94, tile * 0.94, 1),
        ),
        color: new Color(tint(colors[i * 3], pc[0]), tint(colors[i * 3 + 1], pc[1]), tint(colors[i * 3 + 2], pc[2])),
      });
    }
  }
  for (const mesh of buildAtlasInstances({
    geometry: new PlaneGeometry(1, 1),
    library: lib,
    items,
    material: (atlas) => ctx.mats.atlas(lib.atlases[atlas], false),
    rect: 'square',
  })) {
    mesh.name = 'mosaic-tiles';
    group.add(mesh);
  }

  const portrait = hiresOf(content, layout.portraitIndex);
  const overlayMaterial = new MeshBasicMaterial({
    map: cropTexture(portrait, lib.aspects[layout.portraitIndex], cols / rows),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  overlayMaterial.userData.owned = true;
  overlayMaterial.userData.ownsMap = true;
  const overlay = new Mesh(new PlaneGeometry(cols * tile, rows * tile), overlayMaterial);
  overlay.name = 'mosaic-overlay';
  overlay.position.z = 0.01;
  group.add(overlay);

  return {
    ids,
    scene,
    dark: true,
    update(t) {
      const u = localU(span, t);
      overlayMaterial.opacity = smoothstep(0.55, 0.85, u);
      group.scale.setScalar(lerp(1, 0.35, smoothstep(0.6, 1, u)));
    },
    dispose: () => disposeScene(scene),
  };
}
```

- [ ] **Step 5: 實作 `src/stage/sets/network.ts`**

```ts
import {
  AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, Points, PointsMaterial, Quaternion, SphereGeometry, Vector3,
} from 'three';
import type { ShotId, Vec3 } from '../../types';
import { hiresOf, spanOf, type SetContext, type StageSet } from '../context';
import { disposeScene } from '../dispose';
import { buildAtlasInstances } from '../parts/atlas-mesh';
import { darkScene } from './common';

export function buildNetworkSet(ctx: SetContext, ids: ShotId[]): StageSet {
  const { layout, content, tex, mats, storyboard } = ctx;
  const span = spanOf(storyboard, 'network');
  const net = layout.network;
  const lib = content.library;
  const scene = darkScene();
  scene.background = new Color(0x000000);
  const group = new Group();
  group.name = 'network';
  scene.add(group);

  const centerMaterial = new MeshBasicMaterial({ map: hiresOf(content, layout.portraitIndex) });
  centerMaterial.userData.owned = true;
  group.add(new Mesh(new SphereGeometry(0.55, 48, 32), centerMaterial));

  for (const mesh of buildAtlasInstances({
    geometry: new SphereGeometry(1, 20, 14),
    library: lib,
    items: net.nodes.map((node) => ({
      photoIndex: node.photoIndex,
      matrix: new Matrix4().compose(new Vector3(...node.pos), new Quaternion(), new Vector3(node.radius, node.radius, node.radius)),
    })),
    material: (atlas) => mats.atlas(lib.atlases[atlas], false),
    rect: 'square',
  })) {
    mesh.name = 'network-nodes';
    group.add(mesh);
  }

  const posOf = (i: number): Vec3 => (i < 0 ? [0, 0, 0] : net.nodes[i].pos);
  const edgeGeometry = new BufferGeometry();
  edgeGeometry.setAttribute('position', new Float32BufferAttribute(net.edges.flatMap(([a, b]) => [...posOf(a), ...posOf(b)]), 3));
  group.add(new LineSegments(edgeGeometry, mats.nodeLine));

  const points = (positions: number[], size: number, color: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({ size, color, map: tex.glow(), transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const p = new Points(geometry, material);
    p.name = name;
    return p;
  };
  const star = (i: number) => net.stars.slice(i * 3, i * 3 + 3);
  group.add(points(net.stars, 0.09, 0xdfe8ff, 'stars'));
  group.add(points(net.highlights.flatMap(star), 0.28, 0x4aa3ff, 'highlights'));
  const starEdgeGeometry = new BufferGeometry();
  starEdgeGeometry.setAttribute('position', new Float32BufferAttribute(net.starEdges.flatMap(([a, b]) => [...star(a), ...star(b)]), 3));
  group.add(new LineSegments(starEdgeGeometry, mats.starLine));

  return {
    ids,
    scene,
    dark: true,
    update(t) {
      group.rotation.y = 0.06 * (t - span.start);
    },
    dispose: () => disposeScene(scene),
  };
}
```

- [ ] **Step 6: 實作 `src/stage/build.ts`**

```ts
import type { StageTextureFactory } from '../assets/texture-factory';
import type { ShotId, Storyboard } from '../types';
import type { SetContext, StageContent, StageSet } from './context';
import type { StageLayout } from './layout';
import { createStageMaterials } from './parts/materials';
import { buildEndingSet } from './sets/ending';
import { buildLikesSet } from './sets/likes';
import { buildMomentsSet } from './sets/moments';
import { buildMosaicSet } from './sets/mosaic';
import { buildNetworkSet } from './sets/network';
import { buildRobotsSet } from './sets/robots';
import { buildVideosSet } from './sets/videos';
import { buildWallSet } from './sets/wall';
import { buildWordsSet } from './sets/words';
import { WALL_SHOTS } from './wall-run';

export interface Stage {
  sets: StageSet[];
  setFor(id: ShotId): StageSet;
  dispose(): void;
}

const BUILDERS: Partial<Record<ShotId, (ctx: SetContext, ids: ShotId[]) => StageSet>> = {
  moments: buildMomentsSet,
  words: buildWordsSet,
  likes: buildLikesSet,
  videos: buildVideosSet,
  robots: buildRobotsSet,
  mosaic: buildMosaicSet,
  network: buildNetworkSet,
  ending: buildEndingSet,
};

export function buildStage(storyboard: Storyboard, layout: StageLayout, content: StageContent, tex: StageTextureFactory): Stage {
  const mats = createStageMaterials();
  const ctx: SetContext = { storyboard, layout, content, tex, mats };
  const ids = storyboard.shots.map((s) => s.id);
  const sets: StageSet[] = [buildWallSet(ctx, ids.filter((id) => WALL_SHOTS.includes(id)))];
  for (const id of ids) {
    const build = BUILDERS[id];
    if (build) sets.push(build(ctx, [id]));
  }
  const byShot = new Map<ShotId, StageSet>();
  for (const set of sets) for (const id of set.ids) byShot.set(id, set);
  return {
    sets,
    setFor(id) {
      const set = byShot.get(id);
      if (!set) throw new Error(`no set for shot "${id}"`);
      return set;
    },
    dispose() {
      sets.forEach((s) => s.dispose());
      mats.dispose();
    },
  };
}
```

- [ ] **Step 7: 執行確認通過**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部單元測試 PASS（stage-build 6 passed）

- [ ] **Step 8: 提交**

```bash
git add src/stage tests/unit/stage-build.test.ts
git commit -m "feat(v2): robot arms over a photo carpet, portrait photomosaic, constellation network, stage assembly"
```

---
### Task 10: 轉場、調色與舞台渲染器 `render/`

**Files:**
- Create: `src/render/transitions.ts`, `src/render/grade-effect.ts`, `src/render/stage-renderer.ts`
- Modify: `src/typings/n8ao.d.ts`（`N8AOPostPass` 新增 `scene: Scene`）
- Test: `tests/unit/transitions.test.ts`

**Interfaces:**
- Consumes: `Storyboard`, `ShotId`（Task 1）、`shotIndexAt`、`Stage`（Task 9）、`ShotPath`（Task 3）、`smoothstep`
- Produces: `type Entry`、`ENTRY: Record<ShotId, Entry>`、`DIP = 0.6`、`INTRO_FADE = 1.2`、`OUTRO_FADE = 1.5`、`interface Fade { white: boolean; amount: number }`、`fadeAt(sb, t): Fade`；`LETTERBOX_HALF`、`class GradeEffect { setState(fade, frame) }`；`interface MuseumRenderer`（同 v1：`canvas`, `width`, `height`, `setSize`, `renderFrame`, `dispose`）、`createStageRenderer({ canvas, stage, camera, storyboard })`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/transitions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildStoryboard } from '../../src/plan/storyboard';
import { GradeEffect, LETTERBOX_HALF } from '../../src/render/grade-effect';
import { DIP, ENTRY, fadeAt } from '../../src/render/transitions';
import type { ShotId } from '../../src/types';

const sb = buildStoryboard({ photoCount: 12, lengthMode: 'auto', musicDuration: null });
const start = (id: ShotId) => sb.shots.find((s) => s.id === id)!.start;

describe('fadeAt', () => {
  it('opens from white', () => {
    expect(fadeAt(sb, 0)).toEqual({ white: true, amount: 1 });
  });

  it('dips to black into dark rooms, the mosaic and the ending, and to white into the robots', () => {
    expect(fadeAt(sb, start('moments'))).toEqual({ white: false, amount: 1 });
    expect(fadeAt(sb, start('robots'))).toEqual({ white: true, amount: 1 });
    expect(fadeAt(sb, start('mosaic'))).toEqual({ white: false, amount: 1 });
    expect(fadeAt(sb, start('ending'))).toEqual({ white: false, amount: 1 });
  });

  it('cuts between dark rooms and continues along the wall', () => {
    expect(fadeAt(sb, start('words')).amount).toBe(0);
    expect(fadeAt(sb, start('exhibition')).amount).toBe(0);
  });

  it('is clear mid-shot and ends on black', () => {
    const likes = sb.shots.find((s) => s.id === 'likes')!;
    expect(fadeAt(sb, (likes.start + likes.end) / 2).amount).toBe(0);
    expect(fadeAt(sb, sb.total)).toEqual({ white: false, amount: 1 });
  });

  it('dips over DIP seconds either side of the cut', () => {
    const b = start('moments');
    expect(fadeAt(sb, b - DIP).amount).toBe(0);
    expect(fadeAt(sb, b + DIP / 2).amount).toBeCloseTo(0.5, 9);
  });

  it('defines an entry for every shot', () => {
    expect(Object.keys(ENTRY)).toHaveLength(13);
  });
});

describe('GradeEffect', () => {
  it('letterboxes to 2.35:1 inside 16:9', () => {
    expect(LETTERBOX_HALF * 2).toBeCloseTo(16 / 9 / 2.35, 12);
  });

  it('writes the fade colour, amount and letterbox uniforms', () => {
    const grade = new GradeEffect();
    grade.setState({ white: true, amount: 0.4 }, 10);
    expect(grade.uniforms.get('fadeAmount')!.value).toBe(0.4);
    expect(grade.uniforms.get('fadeColor')!.value.x).toBe(1);
    grade.setState({ white: false, amount: 1 }, 11);
    expect(grade.uniforms.get('fadeColor')!.value.x).toBe(0);
    expect(grade.uniforms.get('letterbox')!.value).toBeCloseTo(LETTERBOX_HALF, 12);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/transitions.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `src/render/transitions.ts` 與 `src/render/grade-effect.ts`**

`src/render/transitions.ts`:
```ts
import type { ShotId, Storyboard } from '../types';
import { smoothstep } from '../util/math';

export type Entry = 'fromWhite' | 'continue' | 'cut' | 'blackDip' | 'whiteDip';

/** How each shot is entered (spec §3, 「轉場」 column). */
export const ENTRY: Record<ShotId, Entry> = {
  title: 'fromWhite', intro: 'continue', exhibition: 'continue', portraits: 'continue', photos: 'continue',
  moments: 'blackDip', words: 'cut', likes: 'cut', videos: 'cut', robots: 'whiteDip',
  mosaic: 'blackDip', network: 'cut', ending: 'blackDip',
};

export const DIP = 0.6;
export const INTRO_FADE = 1.2;
export const OUTRO_FADE = 1.5;

export interface Fade {
  white: boolean;
  amount: number;
}

/** Fade colour and strength at t; a dip peaks exactly on the cut, hiding the change of set. */
export function fadeAt(storyboard: Storyboard, t: number): Fade {
  let best: Fade = { white: false, amount: 0 };
  const consider = (white: boolean, amount: number) => {
    if (amount > best.amount) best = { white, amount };
  };
  consider(true, 1 - smoothstep(0, INTRO_FADE, t));
  for (const shot of storyboard.shots.slice(1)) {
    const entry = ENTRY[shot.id];
    if (entry === 'blackDip' || entry === 'whiteDip') consider(entry === 'whiteDip', 1 - smoothstep(0, DIP, Math.abs(t - shot.start)));
  }
  consider(false, smoothstep(storyboard.total - OUTRO_FADE, storyboard.total, t));
  return best;
}
```

`src/render/grade-effect.ts`:
```ts
import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';
import type { Fade } from './transitions';

/** Half the visible band height (in uv) for 2.35:1 inside 16:9. */
export const LETTERBOX_HALF = 16 / 9 / 2.35 / 2;

const fragmentShader = /* glsl */ `
uniform vec3 fadeColor;
uniform float fadeAmount;
uniform float grainAmount;
uniform float seed;
uniform float letterbox;
uniform float saturation;
uniform float lift;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = c * (1.0 - lift) + lift;
  c += (hash(gl_FragCoord.xy + seed) - 0.5) * grainAmount;
  c = mix(c, fadeColor, fadeAmount);
  if (abs(uv.y - 0.5) > letterbox) c = vec3(0.0);
  outputColor = vec4(c, 1.0); // video frames are always opaque
}
`;

/** Desaturation, lifted blacks, film grain, dips to black/white and the 2.35:1 letterbox. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['fadeColor', new Uniform(new Vector3(1, 1, 1))],
        ['fadeAmount', new Uniform(0)],
        ['grainAmount', new Uniform(0.035)],
        ['seed', new Uniform(0)],
        ['letterbox', new Uniform(LETTERBOX_HALF)],
        ['saturation', new Uniform(0.8)],
        ['lift', new Uniform(0.02)],
      ]),
    });
  }

  setState(fade: Fade, frame: number): void {
    (this.uniforms.get('fadeColor')!.value as Vector3).setScalar(fade.white ? 1 : 0);
    this.uniforms.get('fadeAmount')!.value = fade.amount;
    this.uniforms.get('seed')!.value = (frame % 997) * 1.618;
  }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/transitions.test.ts`
Expected: PASS（8 passed）

- [ ] **Step 5: 更新 `src/typings/n8ao.d.ts`（整檔取代）**

```ts
declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    /** The scene whose depth/normals are sampled; swapped together with the render pass. */
    scene: Scene;
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      gammaCorrection: boolean;
      halfRes: boolean;
      [key: string]: unknown;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
```

- [ ] **Step 6: 實作 `src/render/stage-renderer.ts`**

```ts
import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, NoToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ShotPath } from '../camera/shots';
import { shotIndexAt } from '../plan/storyboard';
import type { Stage } from '../stage/build';
import { FPS, type Storyboard } from '../types';
import { GradeEffect } from './grade-effect';
import { fadeAt } from './transitions';

export interface MuseumRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  /** The only drawing entry point: preview and export both call this. */
  renderFrame(t: number): void;
  dispose(): void;
}

export interface StageRendererOptions {
  canvas: HTMLCanvasElement;
  stage: Stage;
  camera: ShotPath;
  storyboard: Storyboard;
}

export function createStageRenderer(o: StageRendererOptions): MuseumRenderer {
  const renderer = new WebGLRenderer({
    canvas: o.canvas,
    antialias: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true, // lets the encoder and tests read the canvas after a frame
  });
  renderer.setPixelRatio(1);
  renderer.toneMapping = NoToneMapping; // tone mapping happens in the effect pass
  renderer.outputColorSpace = SRGBColorSpace;

  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  for (const set of o.stage.sets) {
    if (set.dark) continue;
    set.scene.environment = environment;
    set.scene.environmentIntensity = 0.8;
  }

  const camera = new PerspectiveCamera(40, 16 / 9, 0.05, 500);
  let current = o.stage.sets[0].scene;
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  const renderPass = new RenderPass(current, camera);
  composer.addPass(renderPass);
  const ao = new N8AOPostPass(current, camera, 1280, 720);
  ao.configuration.aoRadius = 1.0;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.2;
  ao.setQualityMode('High');
  // N8AO copies its result into outputBuffer with a depth-tested quad; postprocessing's buffers share the
  // scene depth texture, so the copy is rejected and the next pass reads black. Disable the depth test.
  const copyMaterial = (ao as unknown as { copyQuad: { material: { depthTest: boolean; depthWrite: boolean } } }).copyQuad.material;
  copyMaterial.depthTest = false;
  copyMaterial.depthWrite = false;
  composer.addPass(ao);
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, intensity: 0.2 });
  const grade = new GradeEffect();
  composer.addPass(
    new EffectPass(
      camera,
      new SMAAEffect({ preset: SMAAPreset.HIGH }),
      bloom,
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.35, darkness: 0.45 }),
      grade,
    ),
  );

  let width = 0;
  let height = 0;

  function setSize(w: number, h: number): void {
    width = w;
    height = h;
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function renderFrame(t: number): void {
    const shot = o.storyboard.shots[shotIndexAt(o.storyboard, t)];
    const set = o.stage.setFor(shot.id);
    if (set.scene !== current) {
      current = set.scene;
      renderPass.mainScene = current;
      ao.scene = current;
    }
    set.update(t);
    const pose = o.camera.poseAt(t);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    bloom.intensity = set.dark ? 1.1 : 0.2;
    ao.configuration.intensity = set.dark ? 1.0 : 2.2;
    grade.setState(fadeAt(o.storyboard, t), Math.round(t * FPS));
    composer.render(1 / FPS);
  }

  setSize(1280, 720);

  return {
    canvas: o.canvas,
    get width() { return width; },
    get height() { return height; },
    setSize,
    renderFrame,
    dispose() {
      composer.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
```

- [ ] **Step 7: 型別檢查、全部單元測試並提交**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 無錯誤；全部 PASS（渲染器本身在 Task 13 的 e2e 中驗證）

```bash
git add src/render src/typings tests/unit/transitions.test.ts
git commit -m "feat(v2): transitions, letterbox/grade effect and a stage renderer that switches sets per shot"
```

---

### Task 11: 空靈鋼琴配樂與配樂風格

**Files:**
- Modify: `src/audio/score.ts`, `src/audio/soundtrack.ts`（整檔取代）, `src/app/project.ts`（配合新簽名改一行）, `tests/unit/score.test.ts`, `tests/e2e/audio.spec.ts`

**Interfaces:**
- Consumes: `MusicStyle`（Task 1）
- Produces: `NoteEvent.voice` 新增 `'bell'`；`AIRY_BPM = 60`；`composeAiryScore(duration, seed)`；`synthesizeSoundtrack(duration, seed, style: 'calm' | 'airy' = 'calm')`；`buildSoundtrack(music: { style: MusicStyle; file: File | null }, duration, seed)`；`probeAudioDuration(file): Promise<number>`

- [ ] **Step 1: 寫失敗的測試**

`tests/unit/score.test.ts` 檔尾新增：
```ts
import { composeAiryScore } from '../../src/audio/score';

describe('composeAiryScore', () => {
  it('is deterministic, stays inside the window and rings bells over piano and pads', () => {
    const notes = composeAiryScore(80, 3);
    expect(notes).toEqual(composeAiryScore(80, 3));
    expect(new Set(notes.map((n) => n.voice))).toEqual(new Set(['piano', 'pad', 'bell']));
    for (const n of notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThan(80 - TAIL);
    }
    for (let i = 1; i < notes.length; i++) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
  });

  it('is sparser than the calm score', () => {
    expect(composeAiryScore(120, 1).length).toBeLessThan(composeScore(120, 1).length);
  });
});
```

`tests/e2e/audio.spec.ts`：把最後一個測試整段換成以下三個測試（前三個測試不變）：
```ts
test('undecodable music falls back to the airy soundtrack with a warning', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const bad = new File(['definitely not audio'], 'song.mp3', { type: 'audio/mpeg' });
    const { buffer, warning } = await m.buildSoundtrack({ style: 'upload', file: bad }, 10, 1);
    return { duration: buffer.duration, warning };
  });
  expect(r.duration).toBeCloseTo(10, 2);
  expect(r.warning).toContain('內建配樂');
});

test('the airy style renders an audible soundtrack of the requested length', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const { buffer, warning } = await m.buildSoundtrack({ style: 'airy', file: null }, 16, 4);
    const ch = buffer.getChannelData(1);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    return { duration: buffer.duration, warning, peak };
  });
  expect(r.duration).toBeCloseTo(16, 2);
  expect(r.warning).toBeNull();
  expect(r.peak).toBeGreaterThan(0.05);
});

test('probeAudioDuration reads the length of uploaded music', async ({ page }) => {
  const seconds = await page.evaluate(async (data) => {
    const m = (window as AnyWindow).__soundtrack;
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' });
    return m.probeAudioDuration(file);
  }, b64('tone-5s.wav'));
  expect(seconds).toBeCloseTo(5, 1);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/score.test.ts && npx playwright test tests/e2e/audio.spec.ts`
Expected: FAIL（`composeAiryScore` 不存在；`buildSoundtrack` 的新簽名與 `probeAudioDuration` 不存在）

- [ ] **Step 3: 更新 `src/audio/score.ts`**

把 `voice: 'piano' | 'pad';` 改為 `voice: 'piano' | 'pad' | 'bell';`，並在檔尾新增：
```ts

export const AIRY_BPM = 60;
const AIRY_BEAT = 60 / AIRY_BPM;
const AIRY_BAR = 4 * AIRY_BEAT;

/** Fmaj9 – C/E – Dm9 – B♭maj7(#11), bass first; an original progression, not taken from any existing piece. */
const AIRY_CHORDS = [
  [41, 48, 55, 57, 64, 67],
  [40, 48, 55, 60, 64, 67],
  [38, 45, 53, 57, 60, 64],
  [34, 46, 53, 57, 62, 64],
];
const BELL = [76, 79, 81, 84, 86, 88];

/** Slow, sparse, reverberant piano with pads and bell-like high notes. */
export function composeAiryScore(duration: number, seed: number): NoteEvent[] {
  const rnd = mulberry32(seed ^ 0xa1b2);
  const end = duration - TAIL;
  const events: NoteEvent[] = [];
  for (let bar = 0; bar * AIRY_BAR < end; bar++) {
    const t0 = bar * AIRY_BAR;
    const chord = AIRY_CHORDS[bar % AIRY_CHORDS.length];
    for (const midi of chord.slice(1, 4)) events.push({ time: t0, midi, velocity: 0.12, duration: AIRY_BAR * 1.1, voice: 'pad' });
    events.push({ time: t0, midi: chord[0], velocity: 0.42, duration: AIRY_BAR, voice: 'piano' });
    for (const [beat, idx] of [[0.5, 2], [1.5, 3], [2, 4], [3, 5]] as const) {
      if (rnd() < 0.8) {
        events.push({ time: t0 + beat * AIRY_BEAT, midi: chord[idx], velocity: 0.2 + rnd() * 0.08, duration: AIRY_BEAT * 2.5, voice: 'piano' });
      }
    }
    if (bar >= 1) {
      for (const beat of [1, 2.5]) {
        if (rnd() < 0.55) {
          events.push({ time: t0 + beat * AIRY_BEAT, midi: BELL[Math.floor(rnd() * BELL.length)], velocity: 0.22, duration: AIRY_BEAT * 3, voice: 'bell' });
        }
      }
    }
  }
  return events.filter((e) => e.time < end).sort((a, b) => a.time - b.time);
}
```

- [ ] **Step 4: 取代 `src/audio/soundtrack.ts`**

```ts
import type { MusicStyle } from '../types';
import { mulberry32 } from '../util/rng';
import { TAIL, composeAiryScore, composeScore, type NoteEvent } from './score';

export const SAMPLE_RATE = 48000;
const FADE_IN = 0.5;

const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

function impulseResponse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const rnd = mulberry32(seed ^ 0x5eed);
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (rnd() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function playPartials(ctx: BaseAudioContext, out: AudioNode, ev: NoteEvent, partials: readonly (readonly [number, number])[], decay: number, gain: number): void {
  const f = midiToHz(ev.midi);
  const stopAt = ev.time + ev.duration + decay;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, ev.time);
  env.gain.linearRampToValueAtTime(ev.velocity, ev.time + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0008, stopAt);
  env.connect(out);
  partials.forEach(([ratio, amp], i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * ratio;
    osc.detune.value = (i + 1) * 0.7;
    const g = ctx.createGain();
    g.gain.value = amp * gain;
    osc.connect(g).connect(env);
    osc.start(ev.time);
    osc.stop(stopAt + 0.05);
  });
}

const PIANO = [[1, 1], [2, 0.45], [3, 0.18], [4, 0.08]] as const;
const BELL = [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const;

function playPad(ctx: BaseAudioContext, out: AudioNode, ev: NoteEvent): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  const env = ctx.createGain();
  const release = 1.5;
  env.gain.setValueAtTime(0, ev.time);
  env.gain.linearRampToValueAtTime(ev.velocity, ev.time + 1.2);
  env.gain.setValueAtTime(ev.velocity, ev.time + ev.duration);
  env.gain.linearRampToValueAtTime(0, ev.time + ev.duration + release);
  filter.connect(env).connect(out);
  for (const detune of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToHz(ev.midi);
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    osc.connect(g).connect(filter);
    osc.start(ev.time);
    osc.stop(ev.time + ev.duration + release + 0.05);
  }
}

function masterChain(ctx: BaseAudioContext, duration: number, level: number): GainNode {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(level, FADE_IN);
  master.gain.setValueAtTime(level, Math.max(FADE_IN, duration - TAIL));
  master.gain.linearRampToValueAtTime(0, duration);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);
  return master;
}

export async function synthesizeSoundtrack(duration: number, seed: number, style: 'calm' | 'airy' = 'calm'): Promise<AudioBuffer> {
  const airy = style === 'airy';
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = masterChain(ctx, duration, 0.8);
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = airy ? 0.65 : 0.8;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulseResponse(ctx, airy ? 4.5 : 3.2, seed);
  const wet = ctx.createGain();
  wet.gain.value = airy ? 0.5 : 0.35;
  bus.connect(dry).connect(master);
  bus.connect(reverb).connect(wet).connect(master);
  for (const ev of airy ? composeAiryScore(duration, seed) : composeScore(duration, seed)) {
    if (ev.voice === 'pad') playPad(ctx, bus, ev);
    else if (ev.voice === 'bell') playPartials(ctx, bus, ev, BELL, 2.5, 0.3);
    else playPartials(ctx, bus, ev, PIANO, 1.2 + (96 - ev.midi) / 40, 0.35);
  }
  return ctx.startRendering();
}

async function decode(file: File): Promise<AudioBuffer> {
  return new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(await file.arrayBuffer());
}

export async function probeAudioDuration(file: File): Promise<number> {
  return (await decode(file)).duration;
}

export async function fitUploadedAudio(file: File, duration: number): Promise<AudioBuffer> {
  const decoded = await decode(file);
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.loop = decoded.duration < duration;
  source.connect(masterChain(ctx, duration, 1));
  source.start(0);
  return ctx.startRendering();
}

export async function buildSoundtrack(
  music: { style: MusicStyle; file: File | null },
  duration: number,
  seed: number,
): Promise<{ buffer: AudioBuffer; warning: string | null }> {
  if (music.style !== 'upload') return { buffer: await synthesizeSoundtrack(duration, seed, music.style), warning: null };
  if (!music.file) return { buffer: await synthesizeSoundtrack(duration, seed, 'airy'), warning: '未選擇音樂檔，已改用內建配樂' };
  try {
    return { buffer: await fitUploadedAudio(music.file, duration), warning: null };
  } catch {
    return { buffer: await synthesizeSoundtrack(duration, seed, 'airy'), warning: `無法讀取音樂檔「${music.file.name}」，已改用內建配樂` };
  }
}
```

- [ ] **Step 5: 更新 v1 的 `src/app/project.ts` 呼叫**

把 `const soundtrack = await buildSoundtrack(input.music, timeline.total, seed);` 改為：
```ts
  const soundtrack = await buildSoundtrack({ style: input.music ? 'upload' : 'calm', file: input.music }, timeline.total, seed);
```

- [ ] **Step 6: 執行確認通過**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test tests/e2e/audio.spec.ts`
Expected: 全部 PASS（score 6 passed；audio e2e 6 passed）

- [ ] **Step 7: 提交**

```bash
git add src/audio src/app/project.ts tests/unit/score.test.ts tests/e2e/audio.spec.ts
git commit -m "feat(v2): airy piano soundtrack with bells, music styles and audio duration probe"
```

---

### Task 12: 表單 v2（縮圖網格、500 張、配樂風格、配合音樂長度）

**Files:**
- Modify: `src/types.ts`（`ProjectInput`）、`src/ui/validate.ts`、`src/ui/setup-form.ts`（整檔取代）、`src/ui/styles.css`（檔尾新增）、`index.html`（照片與配樂區塊）、`src/main.ts`（傳入 Worker 池）、`src/app/project.ts`（暫時的相容寫法）、`tests/unit/validate.test.ts`、`tests/e2e/setup-form.spec.ts`（整檔取代）、`tests/e2e/preview.spec.ts`（一行選擇器）

**Interfaces:**
- Consumes: `createPhotoPool`（Task 4）、`LengthMode`, `MusicStyle`（Task 1）
- Produces: `ProjectInput { …; durationMode: LengthMode; musicStyle: MusicStyle; music: File | null }`；`MAX_PHOTOS = 500`；`parseDuration(v): LengthMode`；`parseMusicStyle(v): MusicStyle`；`interface PreviewSource { thumb(file: Blob, maxEdge: number): Promise<{ bitmap: ImageBitmap }> }`；`mountSetupForm(root, previews: PreviewSource, onSubmit)`；DOM id：`#photo-grid`、`#photo-detail`、`#detail-preview`、`#detail-index`、`#detail-caption`、`#detail-portrait`、`#detail-left`、`#detail-right`、`#detail-remove`、`#photo-count`、`#music-style`、`#music-upload`；CSS class：`photo-tile`、`badge`、`selected`、`broken`

- [ ] **Step 1: 更新 `src/types.ts` 的 `ProjectInput`**

把 `durationMode: DurationMode;` 改為 `durationMode: LengthMode;`，並在 `music: File | null;` 前加一行 `musicStyle: MusicStyle;`。

- [ ] **Step 2: 寫失敗的單元測試（`tests/unit/validate.test.ts`）**

把 `describe('parseDuration', …)` 整段換成：
```ts
describe('parseDuration', () => {
  it('maps select values to length modes', () => {
    expect(parseDuration('auto')).toBe('auto');
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('music')).toBe('music');
    expect(() => parseDuration('45')).toThrow();
  });
});

describe('parseMusicStyle', () => {
  it('accepts the three styles only', () => {
    expect(parseMusicStyle('airy')).toBe('airy');
    expect(parseMusicStyle('calm')).toBe('calm');
    expect(parseMusicStyle('upload')).toBe('upload');
    expect(() => parseMusicStyle('nijiko')).toThrow();
  });
});

describe('limits', () => {
  it('allows up to 500 photos', () => {
    expect(MAX_PHOTOS).toBe(500);
  });
});
```
並把第一行 import 改為：
```ts
import { MAX_PHOTOS, capPhotos, isImageFile, parseDuration, parseKeywords, parseMusicStyle, validateSetup } from '../../src/ui/validate';
```

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL（`parseMusicStyle` 不存在；`parseDuration('music')` 丟出錯誤；`MAX_PHOTOS` 為 60）

- [ ] **Step 3: 更新 `src/ui/validate.ts`**

- `export const MAX_PHOTOS = 60;` 改為 `export const MAX_PHOTOS = 500;`
- 第一行改為 `import type { LengthMode, MusicStyle } from '../types';`
- `parseDuration` 換成：
```ts
export function parseDuration(value: string): LengthMode {
  if (value === 'auto' || value === 'music') return value;
  const n = Number(value);
  if (n === 30 || n === 60 || n === 90 || n === 120) return n;
  throw new Error(`unknown duration option: ${value}`);
}

export function parseMusicStyle(value: string): MusicStyle {
  if (value === 'airy' || value === 'calm' || value === 'upload') return value;
  throw new Error(`unknown music style: ${value}`);
}
```

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: PASS（9 passed）

- [ ] **Step 4: 更新 `index.html`**

把第一個 `<fieldset class="block">`（「1. 照片」）整段換成：
```html
          <fieldset class="block">
            <legend>1. 照片</legend>
            <label id="dropzone" class="dropzone" for="photo-input">
              <strong>點此選擇或拖放照片</strong>
              <span>3–500 張；可拖曳縮圖調整順序，點選縮圖可編輯說明文字或設為主視覺</span>
            </label>
            <input id="photo-input" type="file" accept="image/*" multiple hidden />
            <p id="setup-notice" class="notice" role="status"></p>
            <div id="photo-detail" class="photo-detail" hidden>
              <canvas id="detail-preview" width="240" height="180"></canvas>
              <div class="detail-fields">
                <p id="detail-index" class="detail-index"></p>
                <label class="field"><span>說明文字</span><input id="detail-caption" maxlength="80" placeholder="說明文字（選填）" /></label>
                <div class="detail-actions">
                  <button id="detail-portrait" type="button">設為主視覺</button>
                  <button id="detail-left" type="button" aria-label="往前移">←</button>
                  <button id="detail-right" type="button" aria-label="往後移">→</button>
                  <button id="detail-remove" type="button">移除</button>
                </div>
              </div>
            </div>
            <p id="photo-count" class="notice">0 / 500 張</p>
            <ol id="photo-grid" class="photo-grid"></ol>
          </fieldset>
```
在 `<select id="duration">` 的 `120 秒` 選項後面加上：
```html
                <option value="music" disabled>配合音樂長度（需上傳音樂）</option>
```
把配樂那一行 `<label class="field"><span>配樂（選填）</span>…</label>` 換成：
```html
            <label class="field"><span>配樂</span>
              <select id="music-style">
                <option value="airy" selected>空靈鋼琴（致敬原作氛圍）</option>
                <option value="calm">靜謐鋼琴</option>
                <option value="upload">上傳音樂…</option>
              </select>
            </label>
            <label id="music-upload" class="field" hidden><span>音樂檔</span><input id="music" type="file" accept="audio/*" /><small>可上傳你持有的原作配樂，並把長度設為「配合音樂長度」</small></label>
```

- [ ] **Step 5: 在 `src/ui/styles.css` 檔尾新增**

```css
.photo-grid { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.photo-tile { position: relative; border: 1px solid var(--line); background: #efeee9; cursor: pointer; aspect-ratio: 4 / 3; }
.photo-tile canvas { width: 100%; height: 100%; display: block; }
.photo-tile .idx { position: absolute; left: 4px; bottom: 3px; font-size: 11px; color: #fff; text-shadow: 0 0 3px rgb(0 0 0 / 0.8); font-variant-numeric: tabular-nums; }
.photo-tile .badge { position: absolute; right: 3px; top: 3px; font-size: 11px; padding: 1px 5px; background: var(--ink); color: var(--paper); }
.photo-tile.selected { outline: 2px solid var(--ink); outline-offset: 1px; }
.photo-tile.dragging { opacity: 0.4; }
.photo-tile.broken { background: repeating-linear-gradient(45deg, #eee, #eee 6px, #ddd 6px, #ddd 12px); }
.photo-detail { display: grid; grid-template-columns: 240px 1fr; gap: 16px; margin: 12px 0; padding: 12px; border: 1px solid var(--line); background: #fafaf8; }
.photo-detail canvas { width: 240px; height: 180px; background: #e7e6e1; display: block; }
.detail-index { margin: 0 0 10px; font-size: 13px; color: var(--muted); word-break: break-all; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 640px) {
  .photo-detail { grid-template-columns: 1fr; }
  .photo-detail canvas { width: 100%; height: auto; aspect-ratio: 4 / 3; }
}
```

- [ ] **Step 6: 取代 `src/ui/setup-form.ts`**

```ts
import type { ProjectInput, Resolution } from '../types';
import { MAX_PHOTOS, capPhotos, isImageFile, parseDuration, parseKeywords, parseMusicStyle, validateSetup } from './validate';

export interface PreviewSource {
  thumb(file: Blob, maxEdge: number): Promise<{ bitmap: ImageBitmap }>;
}

interface PhotoEntry {
  id: number;
  file: File;
  caption: string;
  preview: ImageBitmap | null;
  requested: boolean;
}

const PREVIEW_EDGE = 160;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function drawCover(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

export function mountSetupForm(root: HTMLElement, previews: PreviewSource, onSubmit: (input: ProjectInput) => void): void {
  const q = <T extends Element>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`${selector} is missing from the setup form`);
    return node;
  };
  const form = q<HTMLFormElement>('#setup-form');
  const photoInput = q<HTMLInputElement>('#photo-input');
  const dropzone = q<HTMLElement>('#dropzone');
  const grid = q<HTMLOListElement>('#photo-grid');
  const notice = q<HTMLElement>('#setup-notice');
  const count = q<HTMLElement>('#photo-count');
  const detail = q<HTMLElement>('#photo-detail');
  const detailPreview = q<HTMLCanvasElement>('#detail-preview');
  const detailIndex = q<HTMLElement>('#detail-index');
  const detailCaption = q<HTMLInputElement>('#detail-caption');
  const detailPortrait = q<HTMLButtonElement>('#detail-portrait');
  const detailLeft = q<HTMLButtonElement>('#detail-left');
  const detailRight = q<HTMLButtonElement>('#detail-right');
  const detailRemove = q<HTMLButtonElement>('#detail-remove');
  const errors = q<HTMLElement>('#setup-errors');
  const generate = q<HTMLButtonElement>('#generate');
  const name = q<HTMLInputElement>('#name');
  const subtitle = q<HTMLInputElement>('#subtitle');
  const date = q<HTMLInputElement>('#date');
  const keywords = q<HTMLTextAreaElement>('#keywords');
  const duration = q<HTMLSelectElement>('#duration');
  const resolution = q<HTMLSelectElement>('#resolution');
  const musicStyle = q<HTMLSelectElement>('#music-style');
  const musicUpload = q<HTMLElement>('#music-upload');
  const music = q<HTMLInputElement>('#music');
  const musicLength = q<HTMLOptionElement>('#duration option[value="music"]');

  let entries: PhotoEntry[] = [];
  let portraitId: number | null = null;
  let selectedId: number | null = null;
  let nextId = 1;
  let dragId: number | null = null;
  let touched = false;

  const tileOf = (id: number) => grid.querySelector<HTMLLIElement>(`[data-id="${id}"]`);

  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        observer.unobserve(record.target);
        const entry = entries.find((e) => e.id === Number((record.target as HTMLElement).dataset.id));
        if (entry) requestPreview(entry);
      }
    },
    { rootMargin: '200px' },
  );

  function paint(entry: PhotoEntry): void {
    const canvas = tileOf(entry.id)?.querySelector('canvas');
    if (canvas && entry.preview) drawCover(canvas, entry.preview);
    if (selectedId === entry.id && entry.preview) drawCover(detailPreview, entry.preview);
  }

  function requestPreview(entry: PhotoEntry): void {
    if (entry.requested) return;
    entry.requested = true;
    previews.thumb(entry.file, PREVIEW_EDGE).then(
      ({ bitmap }) => {
        entry.preview = bitmap;
        paint(entry);
      },
      (err: Error) => {
        entry.requested = false;
        const tile = tileOf(entry.id);
        if (!tile) return;
        if (err.message.includes('disposed')) observer.observe(tile);
        else tile.classList.add('broken');
      },
    );
  }

  function refresh(): void {
    const problems = validateSetup({ photoCount: entries.length, name: name.value });
    generate.disabled = problems.length > 0;
    errors.textContent = touched ? problems.join('；') : '';
    count.textContent = `${entries.length} / ${MAX_PHOTOS} 張`;
  }

  function renderDetail(): void {
    const index = entries.findIndex((e) => e.id === selectedId);
    if (index < 0) {
      detail.hidden = true;
      return;
    }
    const entry = entries[index];
    detail.hidden = false;
    detailIndex.textContent = `No. ${String(index + 1).padStart(3, '0')}・${entry.file.name}`;
    detailCaption.value = entry.caption;
    detailLeft.disabled = index === 0;
    detailRight.disabled = index === entries.length - 1;
    const isPortrait = entry.id === portraitId;
    detailPortrait.disabled = isPortrait;
    detailPortrait.textContent = isPortrait ? '已是主視覺' : '設為主視覺';
    detailPreview.getContext('2d')?.clearRect(0, 0, detailPreview.width, detailPreview.height);
    if (entry.preview) drawCover(detailPreview, entry.preview);
  }

  function renderTile(entry: PhotoEntry, index: number): HTMLLIElement {
    const canvas = el('canvas', { width: 120, height: 90 });
    const tile = el('li', { className: 'photo-tile', draggable: true, title: entry.file.name }, canvas, el('span', { className: 'idx' }, String(index + 1).padStart(3, '0')));
    tile.dataset.id = String(entry.id);
    if (entry.id === portraitId) tile.append(el('span', { className: 'badge' }, '主視覺'));
    if (entry.id === selectedId) tile.classList.add('selected');
    tile.addEventListener('click', () => {
      selectedId = entry.id;
      render();
    });
    tile.addEventListener('dragstart', () => { dragId = entry.id; tile.classList.add('dragging'); });
    tile.addEventListener('dragend', () => { dragId = null; tile.classList.remove('dragging'); });
    tile.addEventListener('dragover', (ev) => { if (dragId !== null) ev.preventDefault(); });
    tile.addEventListener('drop', (ev) => {
      if (dragId === null) return;
      ev.preventDefault();
      move(entries.findIndex((e) => e.id === dragId), entries.findIndex((e) => e.id === entry.id));
    });
    return tile;
  }

  function render(): void {
    observer.disconnect();
    grid.replaceChildren(...entries.map(renderTile));
    for (const entry of entries) {
      if (entry.preview) paint(entry);
      else observer.observe(tileOf(entry.id)!);
    }
    renderDetail();
    refresh();
  }

  function move(from: number, to: number): void {
    if (from < 0 || to < 0 || to >= entries.length || from === to) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    render();
  }

  function remove(id: number): void {
    const index = entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    entries[index].preview?.close();
    entries.splice(index, 1);
    if (portraitId === id) portraitId = entries[0]?.id ?? null;
    selectedId = entries[Math.min(index, entries.length - 1)]?.id ?? null;
    render();
  }

  function addFiles(files: File[]): void {
    touched = true;
    const images = files.filter(isImageFile);
    const { kept, dropped } = capPhotos(images, MAX_PHOTOS - entries.length);
    for (const file of kept) entries.push({ id: nextId++, file, caption: '', preview: null, requested: false });
    if (portraitId === null && entries.length > 0) portraitId = entries[0].id;
    const messages: string[] = [];
    if (dropped > 0) messages.push(`最多 ${MAX_PHOTOS} 張照片，已略過 ${dropped} 張`);
    if (files.length > images.length) messages.push(`已略過 ${files.length - images.length} 個非圖片檔`);
    notice.textContent = messages.join('；');
    render();
  }

  function syncMusicLength(): void {
    const upload = musicStyle.value === 'upload';
    musicUpload.hidden = !upload;
    musicLength.disabled = !(upload && (music.files?.length ?? 0) > 0);
    if (musicLength.disabled && duration.value === 'music') duration.value = 'auto';
  }

  detailCaption.addEventListener('input', () => {
    const entry = entries.find((e) => e.id === selectedId);
    if (entry) entry.caption = detailCaption.value;
  });
  detailPortrait.addEventListener('click', () => {
    portraitId = selectedId;
    render();
  });
  detailLeft.addEventListener('click', () => {
    const i = entries.findIndex((e) => e.id === selectedId);
    move(i, i - 1);
  });
  detailRight.addEventListener('click', () => {
    const i = entries.findIndex((e) => e.id === selectedId);
    move(i, i + 1);
  });
  detailRemove.addEventListener('click', () => {
    if (selectedId !== null) remove(selectedId);
  });

  photoInput.addEventListener('change', () => {
    addFiles([...(photoInput.files ?? [])]);
    photoInput.value = '';
  });
  // Keep the browser from navigating to image files dropped outside the drop zone.
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => ev.preventDefault());
  dropzone.addEventListener('dragenter', () => dropzone.classList.add('over'));
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', (ev) => {
    dropzone.classList.remove('over');
    addFiles([...(ev.dataTransfer?.files ?? [])]);
  });
  name.addEventListener('input', () => {
    touched = true;
    refresh();
  });
  musicStyle.addEventListener('change', syncMusicLength);
  music.addEventListener('change', syncMusicLength);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    touched = true;
    refresh();
    if (generate.disabled) return;
    const style = parseMusicStyle(musicStyle.value);
    onSubmit({
      photos: entries.map((e) => e.file),
      captions: entries.map((e) => e.caption.trim()),
      portraitIndex: Math.max(0, entries.findIndex((e) => e.id === portraitId)),
      name: name.value.trim(),
      subtitle: subtitle.value.trim(),
      date: date.value,
      keywords: parseKeywords(keywords.value),
      durationMode: parseDuration(duration.value),
      resolution: resolution.value as Resolution,
      musicStyle: style,
      music: style === 'upload' ? music.files?.[0] ?? null : null,
    });
  });

  syncMusicLength();
  refresh();
}
```

- [ ] **Step 7: 讓 v1 的組裝程式暫時相容（Task 13 會整檔取代）**

`src/app/project.ts`：
- 把 `const timeline = buildTimeline({ photoCount: photos.length, durationMode: input.durationMode, hasKeywords: input.keywords.length > 0 });` 中的 `durationMode: input.durationMode` 改為 `durationMode: input.durationMode === 'music' ? 'auto' : input.durationMode`
- 把 `{ style: input.music ? 'upload' : 'calm', file: input.music }` 改為 `{ style: input.musicStyle, file: input.music }`

`src/main.ts`：
- 在 import 區加上 `import { createPhotoPool } from './assets/photo-pool';`
- 在 `let session` 之前加上 `const pool = createPhotoPool();`
- 把 `mountSetupForm(setup, async (input) => {` 改為 `mountSetupForm(setup, pool, async (input) => {`

`tests/e2e/preview.spec.ts`（v1）：把 `await expect(page.locator('.photo-item')).toHaveCount(5);` 改為 `await expect(page.locator('.photo-tile')).toHaveCount(5);`

- [ ] **Step 8: 取代 `tests/e2e/setup-form.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { fixture, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;
const tiles = (page: Page) => page.locator('.photo-tile');
const tileNames = (page: Page) => tiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).title));
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('generate stays disabled until 3 photos and a name are provided', async ({ page }) => {
  await page.goto('/');
  const generate = page.locator('#generate');
  await page.setInputFiles('#photo-input', [fixture('photo-1.jpg'), fixture('photo-2.jpg')]);
  await expect(tiles(page)).toHaveCount(2);
  await expect(generate).toBeDisabled();
  await expect(page.locator('#setup-errors')).toContainText('請至少選擇 3 張照片');
  await page.setInputFiles('#photo-input', [fixture('photo-3.jpg')]);
  await expect(page.locator('#photo-count')).toHaveText('3 / 500 張');
  await page.fill('#name', '小明');
  await expect(generate).toBeEnabled();
});

test('tiles can be selected, reordered, removed and set as the portrait', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  await expect(tiles(page).nth(0).locator('.badge')).toHaveText('主視覺');
  await tiles(page).nth(0).click();
  await expect(page.locator('#photo-detail')).toBeVisible();
  await expect(page.locator('#detail-index')).toContainText('No. 001');
  await page.click('#detail-right');
  expect(await tileNames(page)).toEqual(['photo-2.jpg', 'photo-1.jpg', 'photo-3.jpg']);
  await expect(tiles(page).nth(1).locator('.badge')).toHaveText('主視覺');
  await tiles(page).nth(2).click();
  await page.click('#detail-portrait');
  await expect(tiles(page).nth(2).locator('.badge')).toHaveText('主視覺');
  await expect(tiles(page).nth(1).locator('.badge')).toHaveCount(0);
  await page.click('#detail-remove');
  await expect(tiles(page)).toHaveCount(2);
  await expect(tiles(page).nth(0).locator('.badge')).toHaveText('主視覺');
});

test('previews are drawn by the worker pool', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', ['photo-4.jpg', 'photo-5.jpg', 'photo-1.jpg'].map(fixture));
  await expect
    .poll(() => tiles(page).nth(0).locator('canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(60, 45, 1, 1).data;
      return d[3];
    }))
    .toBe(255);
});

test('submitting hands the parsed form values to the callback', async ({ page }) => {
  await page.goto('/');
  // Re-mount the form on a listener-free copy of #setup so the test owns the submit callback.
  await page.evaluate(() => {
    const old = document.getElementById('setup')!;
    old.replaceWith(old.cloneNode(true));
  });
  await loadModule(page, '/src/ui/setup-form.ts', '__form');
  await loadModule(page, '/src/assets/photo-pool.ts', '__pool');
  await page.evaluate(() => {
    const w = window as AnyWindow;
    w.__form.mountSetupForm(document.getElementById('setup'), w.__pool.createPhotoPool(2), (input: any) => {
      w.__submitted = { ...input, photos: input.photos.map((f: File) => f.name), music: input.music?.name ?? null };
    });
  });
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  await tiles(page).nth(2).click();
  await page.click('#detail-portrait');
  await tiles(page).nth(0).click();
  await page.fill('#detail-caption', '第一天');
  await page.fill('#name', ' 小明 ');
  await page.fill('#keywords', '勇氣，旅行\n勇氣');
  await page.selectOption('#duration', '60');
  await page.selectOption('#resolution', '720p');
  await page.selectOption('#music-style', 'calm');
  await page.click('#generate');
  const input = await (await page.waitForFunction(() => (window as AnyWindow).__submitted)).jsonValue();
  expect(input).toMatchObject({
    photos: ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'],
    captions: ['第一天', '', ''],
    portraitIndex: 2,
    name: '小明',
    keywords: ['勇氣', '旅行'],
    durationMode: 60,
    resolution: '720p',
    musicStyle: 'calm',
    music: null,
  });
});

test('music length mode is only available after uploading music', async ({ page }) => {
  await page.goto('/');
  const option = page.locator('#duration option[value="music"]');
  await expect(option).toBeDisabled();
  await expect(page.locator('#music-upload')).toBeHidden();
  await page.selectOption('#music-style', 'upload');
  await expect(page.locator('#music-upload')).toBeVisible();
  await expect(option).toBeDisabled();
  await page.setInputFiles('#music', fixture('tone-5s.wav'));
  await expect(option).toBeEnabled();
  await page.selectOption('#duration', 'music');
  await page.selectOption('#music-style', 'airy');
  await expect(page.locator('#duration')).toHaveValue('auto');
  await expect(option).toBeDisabled();
});

test('caps the library at 500 photos', async ({ page }) => {
  await page.goto('/');
  const files = Array.from({ length: 505 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: TINY_PNG }));
  await page.setInputFiles('#photo-input', files);
  await expect(page.locator('#photo-count')).toHaveText('500 / 500 張');
  await expect(page.locator('#setup-notice')).toContainText('已略過 5 張');
});
```

- [ ] **Step 9: 執行確認通過**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test tests/e2e/setup-form.spec.ts tests/e2e/preview.spec.ts`
Expected: 全部 PASS（setup-form 6 passed；v1 預覽仍可運作，因為 v1 組裝已相容新的 `ProjectInput`）

- [ ] **Step 10: 提交**

```bash
git add index.html src tests/unit/validate.test.ts tests/e2e/setup-form.spec.ts
git commit -m "feat(v2): thumbnail grid form for up to 500 photos, music styles and music-length option"
```

---

### Task 13: 切換到 v2 並移除 v1

**Files:**
- Modify: `src/app/project.ts`（整檔取代）、`src/main.ts`（整檔取代）、`src/types.ts`（移除 v1 型別）、`index.html`（忙碌遮罩加上取消鈕）
- Create: `tests/unit/hermite.test.ts`, `tests/e2e/project.spec.ts`
- Modify: `tests/e2e/preview.spec.ts`（整檔取代）
- Delete: `src/plan/timeline.ts`、`src/museum/`（整個資料夾）、`src/camera/keys.ts`、`src/render/fades.ts`、`src/render/finish-effect.ts`、`src/render/renderer.ts`、`src/assets/photos.ts`、`tests/unit/timeline.test.ts`、`tests/unit/layout.test.ts`、`tests/unit/camera.test.ts`、`tests/unit/fades.test.ts`、`tests/unit/museum.test.ts`、`tests/unit/photos.test.ts`、`tests/e2e/photos.spec.ts`

**Interfaces:**
- Consumes: 前面所有 v2 Task 的輸出
- Produces: `interface Project { input; storyboard; layout; stage; camera: ShotPath; soundtrack; warnings; dispose() }`；`buildProject(input, pool, onStatus): Promise<Project>`；`#busy-cancel`

- [ ] **Step 1: 保留 Hermite 的測試**

建立 `tests/unit/hermite.test.ts`：內容是 `tests/unit/camera.test.ts` 開頭的 import（只留 `vitest`、`createCameraPath`／`Keyframe`、`Vec3`）、`key`／`round` 兩個輔助函式，以及整個 `describe('createCameraPath', …)` 區塊，原封不動搬過來：

```ts
import { describe, expect, it } from 'vitest';
import { createCameraPath, type Keyframe } from '../../src/camera/hermite';
import type { Vec3 } from '../../src/types';

const key = (t: number, pos: Vec3, hold = false): Keyframe => ({ t, pos, target: [pos[0], pos[1], pos[2] - 5], hold });
const round = (v: Vec3) => v.map((x) => +x.toFixed(9));

describe('createCameraPath', () => {
  it('passes through every keyframe', () => {
    const keys = [key(0, [0, 0, 0], true), key(1, [1, 0, 0]), key(3, [1, 2, 0]), key(4, [0, 2, 0], true)];
    const path = createCameraPath(keys);
    for (const k of keys) expect(round(path.poseAt(k.t).pos)).toEqual(k.pos);
  });

  it('stays still between two hold keys at the same position', () => {
    const path = createCameraPath([key(0, [0, 0, 0]), key(1, [2, 0, 0], true), key(3, [2, 0, 0], true), key(4, [5, 0, 0])]);
    for (const t of [1, 1.5, 2, 2.9, 3]) expect(path.poseAt(t).pos[0]).toBeCloseTo(2, 9);
  });

  it('has continuous velocity through pass-through keys', () => {
    const path = createCameraPath([key(0, [0, 0, 0], true), key(1.3, [2, 1, 0]), key(2, [3, 1, -2]), key(4, [3, 4, -2], true)]);
    const d = 1e-5;
    const diff = (a: number, b: number) => {
      const p = path.poseAt(a).pos;
      const q = path.poseAt(b).pos;
      return q.map((v, i) => (v - p[i]) / (b - a));
    };
    for (const t of [1.3, 2]) {
      const left = diff(t - d, t);
      const right = diff(t, t + d);
      left.forEach((v, i) => expect(v).toBeCloseTo(right[i], 3));
    }
  });

  it('clamps outside the keyed range', () => {
    const path = createCameraPath([key(0, [0, 0, 0]), key(2, [4, 0, 0])]);
    expect(round(path.poseAt(-1).pos)).toEqual([0, 0, 0]);
    expect(round(path.poseAt(99).pos)).toEqual([4, 0, 0]);
    expect(path.duration).toBe(2);
  });

  it('rejects non-increasing keyframe times and too few keys', () => {
    expect(() => createCameraPath([key(0, [0, 0, 0]), key(0, [1, 0, 0])])).toThrow();
    expect(() => createCameraPath([key(0, [0, 0, 0])])).toThrow();
  });
});
```

- [ ] **Step 2: 寫失敗的 e2e**

`tests/e2e/preview.spec.ts`（整檔取代）:
```ts
import { expect, test, type Page } from '@playwright/test';
import { buildStoryboard } from '../../src/plan/storyboard';
import type { ShotId } from '../../src/types';
import { fillSetup } from './helpers';

const KIND: Record<ShotId, 'white' | 'dark' | 'any'> = {
  title: 'white', intro: 'white', exhibition: 'white', portraits: 'white', photos: 'white',
  moments: 'dark', words: 'dark', likes: 'dark', videos: 'any', robots: 'white',
  mosaic: 'any', network: 'dark', ending: 'any',
};

/** Letterbox brightness and, inside the picture band, contrast and median luminance. */
async function frameStats(page: Page, t: number) {
  await page.locator('#scrub').fill(String(t));
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
    const W = 96;
    const H = 54;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const g = off.getContext('2d')!;
    g.drawImage(canvas, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const lum = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return (d[i] + d[i + 1] + d[i + 2]) / 3;
    };
    let barMax = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < W; x++) barMax = Math.max(barMax, lum(x, y), lum(x, H - 1 - y));
    const band: number[] = [];
    for (let y = Math.floor(H * 0.16); y < Math.ceil(H * 0.84); y++) for (let x = 0; x < W; x++) band.push(lum(x, y));
    band.sort((a, b) => a - b);
    return { barMax, contrast: band[band.length - 1] - band[0], median: band[Math.floor(band.length / 2)] };
  });
}

test('every shot renders with the expected brightness inside a 2.35:1 letterbox', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const storyboard = buildStoryboard({ photoCount: 5, lengthMode: 'auto', musicDuration: null });
  expect(Number(await page.locator('#scrub').getAttribute('max'))).toBeCloseTo(storyboard.total, 6);
  for (const shot of storyboard.shots) {
    const stats = await frameStats(page, (shot.start + shot.end) / 2);
    await page.locator('#viewport canvas').screenshot({ path: test.info().outputPath(`shot-${shot.id}.png`) });
    expect(stats.barMax, `${shot.id} letterbox`).toBeLessThan(14);
    expect(stats.contrast, `${shot.id} contrast`).toBeGreaterThan(25);
    if (KIND[shot.id] === 'white') expect(stats.median, `${shot.id} should be a white room`).toBeGreaterThan(140);
    if (KIND[shot.id] === 'dark') expect(stats.median, `${shot.id} should be a dark room`).toBeLessThan(90);
  }
  expect(errors).toEqual([]);
});

test('play advances time and pause stops it', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await fillSetup(page, { name: '小明', duration: '30', resolution: '720p' });
  await page.click('#play');
  await expect.poll(async () => Number(await page.locator('#scrub').inputValue()), { timeout: 20_000 }).toBeGreaterThan(0.5);
  await page.click('#play');
  const paused = Number(await page.locator('#scrub').inputValue());
  await page.waitForTimeout(800);
  expect(Number(await page.locator('#scrub').inputValue())).toBe(paused);
});

test('back returns to the form with its inputs intact', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await fillSetup(page, { name: '小明', duration: '30', resolution: '720p' });
  await page.click('#back');
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
  await expect(page.locator('#name')).toHaveValue('小明');
  await expect(page.locator('.photo-tile')).toHaveCount(5);
});
```

`tests/e2e/project.spec.ts`（涵蓋 Review Focus #3、#4）:
```ts
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEFAULT_PHOTOS, fixture } from './helpers';

async function prepare(page: import('@playwright/test').Page, photos: { name: string; mimeType: string; buffer: Buffer }[] | string[]) {
  await page.goto('/');
  await page.setInputFiles('#photo-input', photos as never);
  await page.fill('#name', 'Tim Sparke');
  await page.selectOption('#resolution', '720p');
}

test('music length mode with an undecodable file reports an error', async ({ page }) => {
  await prepare(page, DEFAULT_PHOTOS.map(fixture));
  await page.selectOption('#music-style', 'upload');
  await page.setInputFiles('#music', { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio at all') });
  await page.selectOption('#duration', 'music');
  await page.click('#generate');
  await expect(page.locator('#setup-errors')).toContainText('無法讀取音樂檔', { timeout: 30_000 });
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#busy')).toBeHidden();
});

test('music length mode follows the uploaded music (clamped to 30 s)', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await prepare(page, DEFAULT_PHOTOS.map(fixture));
  await page.selectOption('#music-style', 'upload');
  await page.setInputFiles('#music', fixture('tone-5s.wav'));
  await page.selectOption('#duration', 'music');
  await page.click('#generate');
  await expect(page.locator('#stage')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#time')).toHaveText('0:00 / 0:30');
  await expect(page.locator('#stage-status')).toContainText('30 秒');
});

test('cancelling a large build returns to the form, and building again works', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const bytes = DEFAULT_PHOTOS.map((n) => readFileSync(fixture(n)));
  const many = Array.from({ length: 120 }, (_, i) => ({ name: `${i}.jpg`, mimeType: 'image/jpeg', buffer: bytes[i % bytes.length] }));
  await prepare(page, many);
  await page.click('#generate');
  await expect(page.locator('#busy')).toBeVisible();
  await page.click('#busy-cancel');
  await expect(page.locator('#busy')).toBeHidden();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
  await page.waitForTimeout(3000);
  await expect(page.locator('#stage')).toBeHidden();
  await page.click('#generate');
  await expect(page.locator('#stage')).toBeVisible({ timeout: 180_000 });
});
```

Run: `npx playwright test tests/e2e/preview.spec.ts tests/e2e/project.spec.ts`
Expected: FAIL（v1 的畫面沒有黑邊；沒有 `#busy-cancel`；v1 在 music 模式下不會讀取音樂長度）

- [ ] **Step 3: 取代 `src/app/project.ts`**

```ts
import { bitmapToTexture, loadHires, loadLibrary } from '../assets/library';
import type { PhotoPool } from '../assets/photo-pool';
import { createCanvasTextureFactory, ensureFonts, rasterizeLines } from '../assets/text';
import { buildSoundtrack, probeAudioDuration } from '../audio/soundtrack';
import { buildShots, type ShotPath } from '../camera/shots';
import { buildStoryboard } from '../plan/storyboard';
import { buildStage, type Stage } from '../stage/build';
import { MOSAIC, computeStageLayout, type StageLayout } from '../stage/layout';
import { LED, ledLines, ledWords } from '../stage/parts/led';
import type { ProjectInput, Storyboard } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { exhibitionDate, formatDisplayDate, formatExhibitionStamp } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  storyboard: Storyboard;
  layout: StageLayout;
  stage: Stage;
  camera: ShotPath;
  soundtrack: AudioBuffer;
  warnings: string[];
  dispose(): void;
}

export async function buildProject(input: ProjectInput, pool: PhotoPool, onStatus: (message: string) => void): Promise<Project> {
  const words = ledWords(input.keywords, input.name, input.subtitle);
  onStatus('載入字型…');
  await ensureFonts([
    'The Museum of Me Create and explore a visual archive of your social life memories.',
    'This exhibition is a journey of visualization that explores who is. EXHIBITION Portraits Photos ■ NO. 0123456789:,APM',
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
    const storyboard = buildStoryboard({ photoCount: library.count, lengthMode: input.durationMode, musicDuration });
    if (musicDuration !== null && Math.abs(musicDuration - storyboard.total) > 0.5) {
      warnings.push(`音樂長度 ${Math.round(musicDuration)} 秒不在 30–300 秒之間，影片長度調整為 ${storyboard.total} 秒`);
    }
    const layout = computeStageLayout({ storyboard, aspects: library.aspects, portraitIndex, seed });

    onStatus('準備展示用的高解析照片…');
    await loadHires(library, input.photos, layout.featured, pool);

    onStatus('計算馬賽克…');
    const colors = await pool.grid(input.photos[library.sourceIndices[portraitIndex]], MOSAIC.cols, MOSAIC.rows);
    const assignment = await pool.mosaic(colors, new Float32Array(library.colors.flat()), seed);

    onStatus('繪製 LED 字牆…');
    const led = async (lines: string[]) =>
      bitmapToTexture(await pool.led(rasterizeLines(lines, LED.cols, LED.rows), LED.cols, LED.rows, LED.dot));
    const main = await led(ledLines(words, LED.mainRows, LED.mainUnits));
    const highlight = await led(ledLines(words.slice(0, 1), LED.highlightRows, LED.highlightUnits));
    cleanup.push(() => {
      main.dispose();
      highlight.dispose();
    });

    onStatus('布置展廳…');
    const stage = buildStage(storyboard, layout, {
      library,
      name: input.name,
      subtitle: input.subtitle,
      stamp: formatExhibitionStamp(exhibitionDate(input.date, new Date())),
      dateLabel: formatDisplayDate(input.date),
      captions,
      led: { main, highlight },
      mosaic: { colors, assignment },
    }, createCanvasTextureFactory());
    cleanup.push(() => stage.dispose());
    const camera = buildShots(storyboard, layout);

    onStatus('合成配樂…');
    const soundtrack = await buildSoundtrack({ style: input.musicStyle, file: input.music }, storyboard.total, seed);
    if (soundtrack.warning) warnings.push(soundtrack.warning);

    return {
      input, storyboard, layout, stage, camera, soundtrack: soundtrack.buffer, warnings,
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

- [ ] **Step 4: 取代 `src/main.ts`**

```ts
import './ui/styles.css';
import { buildProject, type Project } from './app/project';
import { createPhotoPool, type PhotoPool } from './assets/photo-pool';
import { exportVideo, type ExportProgress } from './export/exporter';
import { exportFilename } from './export/filename';
import { createPlayer, type Player } from './preview/player';
import { createStageRenderer, type MuseumRenderer } from './render/stage-renderer';
import { FPS, RESOLUTIONS } from './types';
import { mountSetupForm } from './ui/setup-form';
import { formatTime } from './util/format';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

const setup = byId('setup');
const stage = byId('stage');
const viewport = byId('viewport');
const playButton = byId<HTMLButtonElement>('play');
const scrub = byId<HTMLInputElement>('scrub');
const timeLabel = byId('time');
const backButton = byId<HTMLButtonElement>('back');
const exportButton = byId<HTMLButtonElement>('export');
const exportPanel = byId('export-panel');
const exportProgress = byId<HTMLProgressElement>('export-progress');
const exportLabel = byId('export-label');
const cancelButton = byId<HTMLButtonElement>('cancel-export');
const stageStatus = byId('stage-status');
const busy = byId('busy');
const busyLabel = byId('busy-label');
const busyCancel = byId<HTMLButtonElement>('busy-cancel');
const setupErrors = byId('setup-errors');

interface Session {
  project: Project;
  canvas: HTMLCanvasElement;
  renderer: MuseumRenderer;
  player: Player;
}

let pool: PhotoPool = createPhotoPool();
/** Bumped by every new build and by cancel; a finishing build that is no longer current is discarded. */
let buildGeneration = 0;
let session: Session | null = null;
let exporting: AbortController | null = null;

function showBusy(message: string): void {
  busyLabel.textContent = message;
  busy.hidden = false;
}

function fitPreview(s: Session): void {
  const width = Math.max(320, Math.min(960, Math.round(s.canvas.clientWidth * devicePixelRatio)));
  s.renderer.setSize(width, Math.round((width * 9) / 16));
}

function onTick(total: number) {
  return (t: number, playing: boolean): void => {
    scrub.value = String(t);
    timeLabel.textContent = `${formatTime(t)} / ${formatTime(total)}`;
    playButton.textContent = playing ? '❚❚' : '▶';
    playButton.setAttribute('aria-label', playing ? '暫停' : '播放');
  };
}

function openStage(project: Project): void {
  const canvas = document.createElement('canvas');
  viewport.replaceChildren(canvas);
  setup.hidden = true;
  stage.hidden = false;
  const total = project.storyboard.total;
  const renderer = createStageRenderer({ canvas, stage: project.stage, camera: project.camera, storyboard: project.storyboard });
  const player = createPlayer({ render: renderer.renderFrame, audio: project.soundtrack, total, onTick: onTick(total) });
  session = { project, canvas, renderer, player };
  scrub.max = String(total);
  stageStatus.textContent = project.warnings.join('\n');
  fitPreview(session);
  player.seek(0);
}

function closeStage(): void {
  if (session) {
    session.player.dispose();
    session.renderer.dispose();
    session.project.dispose();
    session = null;
  }
  viewport.replaceChildren();
  stage.hidden = true;
  setup.hidden = false;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function showProgress(p: ExportProgress): void {
  const fraction = p.frame / p.frames;
  exportProgress.value = fraction;
  const pct = Math.floor(fraction * 100);
  exportLabel.textContent = p.etaSeconds === null ? `匯出中 ${pct}%` : `匯出中 ${pct}%・剩餘約 ${formatTime(p.etaSeconds)}`;
}

function setExporting(on: boolean): void {
  exportPanel.hidden = !on;
  exportButton.disabled = on;
  backButton.disabled = on;
  playButton.disabled = on;
  scrub.disabled = on;
}

async function runExport(s: Session): Promise<void> {
  const { width, height, bitrate } = RESOLUTIONS[s.project.input.resolution];
  const controller = new AbortController();
  exporting = controller;
  const onContextLost = () => controller.abort(new Error('WebGL 內容遺失，請返回編輯後重新生成'));
  s.canvas.addEventListener('webglcontextlost', onContextLost);
  s.player.pause();
  setExporting(true);
  exportProgress.value = 0;
  exportLabel.textContent = '準備中…';
  stageStatus.textContent = '';
  s.renderer.setSize(width, height);
  try {
    const result = await exportVideo({
      canvas: s.canvas, renderFrame: s.renderer.renderFrame, total: s.project.storyboard.total, fps: FPS,
      width, height, bitrate, audio: s.project.soundtrack, signal: controller.signal, onProgress: showProgress,
    });
    download(result.blob, exportFilename(s.project.input.name, new Date(), result.extension));
    stageStatus.textContent = result.extension === 'webm' ? '此瀏覽器不支援 H.264，已改為輸出 WebM。' : '匯出完成。';
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    stageStatus.textContent = aborted ? '已取消匯出' : err instanceof Error ? err.message : String(err);
  } finally {
    s.canvas.removeEventListener('webglcontextlost', onContextLost);
    exporting = null;
    setExporting(false);
    fitPreview(s);
    s.player.seek(s.player.time);
  }
}

mountSetupForm(setup, { thumb: (file, maxEdge) => pool.thumb(file, maxEdge) }, async (input) => {
  const generation = ++buildGeneration;
  setupErrors.textContent = '';
  showBusy('正在布置展廳…');
  try {
    const project = await buildProject(input, pool, (message) => {
      if (generation === buildGeneration) showBusy(message);
    });
    if (generation !== buildGeneration) {
      project.dispose();
      return;
    }
    openStage(project);
  } catch (err) {
    if (generation !== buildGeneration) return;
    closeStage();
    setupErrors.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    if (generation === buildGeneration) busy.hidden = true;
  }
});

busyCancel.addEventListener('click', () => {
  buildGeneration++;
  pool.dispose();
  pool = createPhotoPool();
  busy.hidden = true;
  closeStage();
});
playButton.addEventListener('click', () => session?.player.toggle());
scrub.addEventListener('input', () => session?.player.seek(Number(scrub.value)));
backButton.addEventListener('click', closeStage);
exportButton.addEventListener('click', () => {
  if (session && !exporting) void runExport(session);
});
cancelButton.addEventListener('click', () => exporting?.abort());
window.addEventListener('resize', () => {
  if (!session || exporting) return;
  fitPreview(session);
  session.player.seek(session.player.time);
});
```

- [ ] **Step 5: `index.html` 忙碌遮罩加上取消鈕**

把 `<div class="busy-card"><div class="spinner"></div><p id="busy-label">準備中…</p></div>` 換成：
```html
        <div class="busy-card"><div class="spinner"></div><p id="busy-label">準備中…</p><button id="busy-cancel" type="button">取消</button></div>
```

- [ ] **Step 6: 刪除 v1 模組與測試，清理型別**

```bash
git rm -r -q src/museum src/plan/timeline.ts src/camera/keys.ts src/render/fades.ts src/render/finish-effect.ts src/render/renderer.ts src/assets/photos.ts \
  tests/unit/timeline.test.ts tests/unit/layout.test.ts tests/unit/camera.test.ts tests/unit/fades.test.ts tests/unit/museum.test.ts tests/unit/photos.test.ts tests/e2e/photos.spec.ts
```

在 `src/types.ts` 中刪除 `SceneId`、`SCENE_ORDER`、`DurationMode`、`SceneSpan`、`GalleryStop`、`Timeline` 的宣告（`LengthMode` 與 `Storyboard` 已取代它們）。

Run: `npx tsc --noEmit && grep -rn "museum/\|plan/timeline\|camera/keys\|render/renderer\|render/fades\|finish-effect\|assets/photos'" src tests || echo clean`
Expected: 型別檢查無錯誤，並輸出 `clean`

- [ ] **Step 7: 執行全部測試**

Run: `npx vitest run && npx playwright test`
Expected: 全部 PASS（包含 v1 的 `export.spec.ts`：30 秒 720p 的 MP4 仍是 900 格、H.264 + AAC）。
- 若 preview.spec 的亮度門檻失敗：只調整該布景的燈光、材質顏色，或 `stage-renderer.ts` 中的 bloom／AO 強度，不改門檻。
- 若黑邊檢查失敗：檢查 `GradeEffect` 是否是 EffectPass 的最後一個效果。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(v2): switch the app to the storyboard stage and remove the v1 museum"
```

---

### Task 14: 對照原作的目視驗收與文件

**Files:**
- Modify: `README.md`（場景與功能段落）；依驗收結果可能修改 `src/stage/sets/*.ts`、`src/stage/layout.ts`、`src/camera/shots.ts` 的常數

**Interfaces:**
- Consumes: 全部
- Produces: 驗收紀錄（寫入 `.superpowers/sdd/…/progress.md` 或提交訊息）

- [ ] **Step 1: 產生每個分鏡的截圖總覽**

Run:
```bash
npx playwright test tests/e2e/preview.spec.ts -g "every shot"
D=$(dirname "$(find test-results -name 'shot-title.png' | head -1)")
ffmpeg -y -loglevel error $(for s in title intro exhibition portraits photos moments words likes videos robots mosaic network ending; do printf -- '-i %s/shot-%s.png ' "$D" "$s"; done) \
  -filter_complex "[0][1][2][3]hstack=4[a];[4][5][6][7]hstack=4[b];[8][9][10][11]hstack=4[c];[12]pad=iw*4:ih[d];[a][b][c][d]vstack=4,scale=1600:-1" test-results/storyboard.png
```
Expected: 產生 `test-results/storyboard.png`（13 格）

- [ ] **Step 2: 與原作逐格比對**

參考資料：`https://deltro.jp/images/img_mom01.jpg`、`img_mom03.jpg`、`img_mom05.jpg`、`img_mom09.jpg`、`img_mom10.jpg`、`img_mom11.jpg`，以及原作影片 `https://www.youtube.com/watch?v=VzCww24eEig`。逐項檢查：

| 分鏡 | 必須看到 |
|---|---|
| title | 白牆、襯線字標題與副標、鏡頭明顯朝右斜看 |
| exhibition | 巨大粗黑體「{NAME} / EXHIBITION」加時間戳，左對齊，位於畫面正中，鏡頭與牆面平行 |
| portraits／photos | 無框厚畫布；Photos 由左下往右上堆疊；前景有寫實比例的參觀者背影 |
| moments | 黑暗中的直立燈箱與上方白色座標文字 |
| words | 整面白色點陣 LED 字牆 |
| likes | 灰色低多邊形「讚」雕塑在圓台上，後方螢幕牆有彩條 |
| videos | 大型多面板影像牆與剪影 |
| robots | 白色空間、平台上鋪滿照片、工業手臂 |
| mosaic | 黑底上由照片組成、浮現主視覺的馬賽克 |
| network | 黑色太空中的照片球與藍色連線光點 |
| ending | 黑底上的白卡「The Museum of Me / NAME / EXHIBITION」 |

有差異時，只調整對應布景檔或 `shots.ts` 中的常數（位置、角度、燈光、材質），每次調整後重跑 `npx vitest run && npx playwright test tests/e2e/preview.spec.ts`，保持全綠。

- [ ] **Step 3: 更新 `README.md`**

把「## 場景」整段換成：
```markdown
## 分鏡（依原作順序）

白牆開場：鏡頭朝右前方斜看「The Museum of Me」，一路等速平移、逐漸轉正，到「{NAME} EXHIBITION」與時間戳時與牆面平行 → Portraits → Photos（照片斜向堆疊）→ 暗房 Moments（燈箱）→ Words（LED 點陣字牆）→ Likes（低多邊形讚手勢雕塑）→ Videos（影像牆）→ 機器手臂與照片平台 → 馬賽克肖像 → 星座網絡 → 片尾卡片。全片為 2.35:1 黑邊、低飽和調色。

- 照片 3–500 張，由 Worker 池並行解碼並打包成縮圖圖集。
- 長度：自動、30／60／90／120 秒，或「配合音樂長度」（上傳音樂後可選，30–300 秒）。
- 配樂：空靈鋼琴（致敬原作氛圍，原創）、靜謐鋼琴，或上傳你持有的音樂（例如原作配樂）。
- 不含任何 Intel／Facebook 商標或原作配樂的錄音。
```
並把 README 開頭的描述第一句保留、第二句改為「照片、音樂都不會離開你的電腦；解碼與重運算在 Web Worker 中完成。」

- [ ] **Step 4: 最終驗證並提交**

Run: `npm test && npm run typecheck && npm run build && npx playwright test`
Expected: 全部 PASS，`dist/` 建置成功

```bash
git add -A
git commit -m "docs: v2 README and storyboard acceptance tuning"
```
