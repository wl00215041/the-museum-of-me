# The Museum of Me（仿作）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一個純前端網頁：使用者選 3–60 張照片並填入文字，生成一段在純白 3D 美術館中漫步的紀念影片，可即時預覽並逐格匯出含配樂的 MP4。

**Architecture:** 整部影片是時間 `t` 的純函式：`plan`（時長分配）→ `layout`（建築與展品座標，純資料）→ `camera`（Hermite 鏡頭路徑）與 `museum`（three.js 場景）→ `render`（postprocessing 管線，`renderFrame(t)` 唯一入口）。預覽用 rAF + AudioContext 呼叫 `renderFrame(t)`；匯出以 1/30 s 固定步長逐格呼叫同一函式，交給 Mediabunny（WebCodecs）編碼 MP4。配樂以 OfflineAudioContext 合成或由上傳檔裁切成一個 `AudioBuffer`，預覽與匯出共用。

**Tech Stack:** Vite 8、TypeScript 5.9、three.js 0.186、postprocessing 6.39、n8ao 2.0、mediabunny 1.60 + @mediabunny/aac-encoder、Vitest 5、Playwright 1.63（Google Chrome channel）、ffprobe（驗證輸出）。

**Spec:** `docs/superpowers/specs/2026-09-28-museum-of-me-design.md`

## Global Constraints

- 照片 3–60 張（`MIN_PHOTOS = 3`、`MAX_PHOTOS = 60`）；關鍵字最多 40 個（`MAX_KEYWORDS = 40`）。
- 時長模式：`'auto' | 30 | 60 | 90 | 120`；自動模式主展廳 `min(N × 3 s, 120 s)`。
- 輸出：720p = 1280×720 @ 6 Mbps；1080p = 1920×1080 @ 12 Mbps；固定 30 fps；音訊 AAC 192 kbps、48 kHz 立體聲。
- 檔名：`museum-of-<name>-<yyyymmdd>.mp4`（WebM 備援時副檔名 `.webm`）。
- 純前端：照片與音樂不得上傳；唯一外部請求是 Google Fonts（Noto Sans TC 300/500/700）。
- 所有 UI 文案為繁體中文；字型堆疊 `"Noto Sans TC", "Noto Sans JP", system-ui, sans-serif`。
- 決定性：`museum.update(t)`、`camera.poseAt(t)`、`fadesAt(t)`、配樂合成不得使用 `Math.random()` 或系統時間；隨機性一律用 `mulberry32(seed)`。
- 色調映射 `ToneMappingMode.NEUTRAL`；照片貼圖最長邊 1600 px。
- 世界座標：美術館沿 −Z 延伸，房間 `z0`（入口，較大）→ `z1`（出口）；Y 向上；視線高度 `EYE = 1.6`。
- 依賴版本以本計畫 Task 1 的安裝指令為準；不得新增其他執行期依賴。

## Review Focus

1. **手機直拍照片（EXIF Orientation = 6）**必須以正確方向顯示，長寬比為直式 → Task 7 的 `photos.spec.ts` 以 `photo-rotated.jpg` 驗證 aspect ≈ 0.667。
2. **損毀或非圖片檔**混在照片中：略過並列出檔名，其餘照片照常生成 → Task 7 的 `photos.spec.ts` 以 `not-an-image.jpg` 驗證 `failed`。
3. **很長的中日韓文名字**（例如 30 個全形字）不得超出入口牆的標題區 → Task 8 的 `museum.test.ts`「a very long name still fits the title box」。
4. **上傳音樂比影片短、比影片長、或無法解碼**：短則循環補滿、長則裁切並淡出、無法解碼則改用內建配樂並提示 → Task 6 的 `audio.spec.ts`。
5. **匯出途中取消**：釋放編碼器、畫布恢復預覽尺寸、可再次匯出 → Task 11 的 `export.spec.ts`「cancelling an export restores the preview」。

（另：關鍵字以全形逗號、頓號或重複輸入 → Task 9 的 `validate.test.ts` 已涵蓋。）

## File Structure

```
index.html                         靜態頁面骨架（表單、舞台、忙碌遮罩）
package.json / tsconfig.json / vite.config.ts / vitest.config.ts / playwright.config.ts
scripts/make-fixtures.mjs          以 ffmpeg 產生測試圖片／音訊
src/
  main.ts                          組裝：表單 → buildProject → 預覽 → 匯出
  types.ts                         共用型別與常數（SceneId、Timeline、ProjectInput、RESOLUTIONS、FPS）
  typings/n8ao.d.ts                n8ao 型別宣告
  util/rng.ts  util/math.ts  util/format.ts
  plan/timeline.ts                 buildTimeline（純函式）
  museum/layout.ts                 computeLayout（純資料，無 three 依賴）
  camera/hermite.ts                Keyframe、createCameraPath
  camera/keys.ts                   各場景 waypoint、時間分配、buildCameraKeys
  render/fades.ts                  開場／片尾淡入淡出（純函式）
  render/finish-effect.ts          顆粒＋白場＋片尾字卡合成（postprocessing Effect）
  render/renderer.ts               WebGLRenderer + EffectComposer，renderFrame(t)
  audio/score.ts                   composeScore（純函式）
  audio/soundtrack.ts              合成／上傳音樂 → AudioBuffer
  assets/texture-factory.ts        TextureFactory 介面
  assets/text.ts                   canvas 文字貼圖、ensureFonts
  assets/photos.ts                 loadPhotos、fitWithin
  museum/materials.ts  museum/architecture.ts  museum/frame.ts  museum/text-plane.ts  museum/visitor.ts
  museum/context.ts                SceneContext / SceneObject / MuseumContent
  museum/scenes/{opening,hall,corridor,gallery,keywords,network,finale}.ts
  museum/build.ts                  buildMuseum
  ui/validate.ts  ui/setup-form.ts  ui/styles.css
  preview/player.ts
  export/filename.ts  export/exporter.ts
  app/project.ts                   buildProject（輸入 → 可播放的專案）
tests/unit/*.test.ts               Vitest（node 環境）
tests/e2e/*.spec.ts                Playwright（Chrome）
tests/fixtures/                    由 scripts/make-fixtures.mjs 產生並提交
```

---

### Task 1: 專案骨架、共用型別與工具函式

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `index.html`, `src/main.ts`, `src/types.ts`, `src/util/rng.ts`, `src/util/math.ts`, `src/util/format.ts`, `scripts/make-fixtures.mjs`, `tests/e2e/helpers.ts`, `tests/e2e/smoke.spec.ts`
- Test: `tests/unit/util.test.ts`

**Interfaces:**
- Produces: `src/types.ts` 全部匯出；`hashString(s: string): number`、`mulberry32(seed: number): () => number`；`clamp`、`lerp`、`smoothstep`；`formatTime(sec: number): string`、`formatDisplayDate(v: string): string`、`truncate(s: string, max: number): string`；e2e 輔助 `fixture(name)`、`b64(name)`、`loadModule(page, path, key)`、`fillSetup(page, opts)`。

- [ ] **Step 1: 建立 package.json 並安裝依賴**

```json
{
  "name": "the-museum-of-me",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "fixtures": "node scripts/make-fixtures.mjs"
  }
}
```

Run:
```bash
npm i three@0.186 postprocessing@6.39 n8ao@2.0 mediabunny@1.60 @mediabunny/aac-encoder@1.60
npm i -D typescript@5.9 vite@8 vitest@5 @playwright/test@1.63 @types/three@0.186 @types/node@24
```
Expected: 安裝成功，無 peer dependency 錯誤（postprocessing 要求 three `<0.187`，0.186 符合）。

- [ ] **Step 2: 設定檔**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```
（`channel: 'chrome'` 使用系統的 Google Chrome，因為 Playwright 內建的 Chromium 沒有 H.264 編碼器。）

`.gitignore`:
```
node_modules
dist
test-results
playwright-report
```

- [ ] **Step 3: index.html（完整頁面骨架，後續 Task 只加行為與樣式）**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Museum of Me</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;500;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <header class="masthead">
      <p class="eyebrow">An exhibition of you</p>
      <h1>The Museum of Me</h1>
      <p class="lede">選擇照片，生成一段在純白美術館中漫步的紀念影片。</p>
    </header>
    <main>
      <section id="setup">
        <form id="setup-form" novalidate>
          <fieldset class="block">
            <legend>1. 照片</legend>
            <label id="dropzone" class="dropzone" for="photo-input">
              <strong>點此選擇或拖放照片</strong>
              <span>3–60 張，可拖曳調整順序；勾選「主視覺」指定大廳與終章的肖像</span>
            </label>
            <input id="photo-input" type="file" accept="image/*" multiple hidden />
            <p id="setup-notice" class="notice" role="status"></p>
            <ol id="photo-list" class="photo-list"></ol>
          </fieldset>
          <fieldset class="block">
            <legend>2. 展覽資訊</legend>
            <label class="field"><span>主角名字 *</span><input id="name" maxlength="40" autocomplete="off" /></label>
            <label class="field"><span>副標題</span><input id="subtitle" maxlength="60" placeholder="例：2026 畢業紀念" /></label>
            <label class="field"><span>日期</span><input id="date" type="date" /></label>
            <label class="field"><span>關鍵字／短語</span><textarea id="keywords" rows="3" placeholder="以逗號或換行分隔，最多 40 個"></textarea></label>
          </fieldset>
          <fieldset class="block">
            <legend>3. 影片設定</legend>
            <label class="field"><span>長度</span>
              <select id="duration">
                <option value="auto" selected>自動（依照片數）</option>
                <option value="30">30 秒</option>
                <option value="60">60 秒</option>
                <option value="90">90 秒</option>
                <option value="120">120 秒</option>
              </select>
            </label>
            <label class="field"><span>解析度</span>
              <select id="resolution">
                <option value="1080p" selected>1080p（1920×1080）</option>
                <option value="720p">720p（1280×720）</option>
              </select>
            </label>
            <label class="field"><span>配樂（選填）</span><input id="music" type="file" accept="audio/*" /><small>未上傳時使用內建鋼琴配樂</small></label>
          </fieldset>
          <p id="setup-errors" class="errors" role="alert"></p>
          <button id="generate" class="primary" type="submit" disabled>布置展廳</button>
        </form>
      </section>
      <section id="stage" hidden>
        <div id="viewport" class="viewport"></div>
        <div class="controls">
          <button id="play" type="button" class="icon" aria-label="播放">▶</button>
          <input id="scrub" type="range" min="0" max="1" step="0.01" value="0" aria-label="時間軸" />
          <span id="time" class="time">0:00 / 0:00</span>
        </div>
        <div class="actions">
          <button id="back" type="button">返回編輯</button>
          <button id="export" type="button" class="primary">匯出影片</button>
        </div>
        <div id="export-panel" class="export-panel" hidden>
          <progress id="export-progress" max="1" value="0"></progress>
          <span id="export-label">準備中…</span>
          <button id="cancel-export" type="button">取消</button>
        </div>
        <p id="stage-status" class="notice" role="status"></p>
      </section>
      <div id="busy" class="busy" hidden>
        <div class="busy-card"><div class="spinner"></div><p id="busy-label">準備中…</p></div>
      </div>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`（Task 9 會取代）:
```ts
console.info('The Museum of Me');
```

- [ ] **Step 4: 共用型別 `src/types.ts`**

```ts
export type SceneId = 'opening' | 'hall' | 'corridor' | 'gallery' | 'keywords' | 'network' | 'finale';

export const SCENE_ORDER: readonly SceneId[] = ['opening', 'hall', 'corridor', 'gallery', 'keywords', 'network', 'finale'];

export type DurationMode = 'auto' | 30 | 60 | 90 | 120;

export type Resolution = '720p' | '1080p';

export const RESOLUTIONS: Record<Resolution, { width: number; height: number; bitrate: number }> = {
  '720p': { width: 1280, height: 720, bitrate: 6_000_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 12_000_000 },
};

export const FPS = 30;

export type Vec3 = [number, number, number];

export interface SceneSpan {
  id: SceneId;
  start: number;
  end: number;
}

export interface GalleryStop {
  start: number;
  end: number;
  photoIndices: number[];
}

export interface Timeline {
  total: number;
  scenes: SceneSpan[];
  galleryStops: GalleryStop[];
}

export interface ProjectInput {
  photos: File[];
  captions: string[];
  portraitIndex: number;
  name: string;
  subtitle: string;
  date: string;
  keywords: string[];
  durationMode: DurationMode;
  resolution: Resolution;
  music: File | null;
}
```

- [ ] **Step 5: 寫失敗的工具函式測試 `tests/unit/util.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatDisplayDate, formatTime, truncate } from '../../src/util/format';
import { clamp, lerp, smoothstep } from '../../src/util/math';
import { hashString, mulberry32 } from '../../src/util/rng';

describe('rng', () => {
  it('mulberry32 is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds give different sequences', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('hashString is stable FNV-1a', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('math', () => {
  it('clamp / lerp / smoothstep', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('format', () => {
  it('formatTime shows m:ss with floored seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.4)).toBe('1:05');
    expect(formatTime(125.9)).toBe('2:05');
  });

  it('formatDisplayDate turns yyyy-mm-dd into yyyy.mm.dd', () => {
    expect(formatDisplayDate('2026-09-28')).toBe('2026.09.28');
    expect(formatDisplayDate('')).toBe('');
  });

  it('truncate counts code points and appends an ellipsis', () => {
    expect(truncate('短句', 5)).toBe('短句');
    expect(truncate('一二三四五六', 4)).toBe('一二三…');
    expect(truncate('😀😀😀', 2)).toBe('😀…');
  });
});
```

- [ ] **Step 6: 執行測試確認失敗**

Run: `npx vitest run tests/unit/util.test.ts`
Expected: FAIL（找不到 `../../src/util/format` 等模組）

- [ ] **Step 7: 實作工具函式**

`src/util/rng.ts`:
```ts
/** FNV-1a 32-bit hash, used to derive deterministic seeds from user input. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small, fast seeded PRNG returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`src/util/math.ts`:
```ts
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const u = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return u * u * (3 - 2 * u);
}
```

`src/util/format.ts`:
```ts
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDisplayDate(value: string): string {
  return value ? value.replaceAll('-', '.') : '';
}

export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}
```

- [ ] **Step 8: 執行測試確認通過**

Run: `npx vitest run tests/unit/util.test.ts`
Expected: PASS（7 passed）

- [ ] **Step 9: 測試素材產生腳本 `scripts/make-fixtures.mjs`**

```js
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const dir = 'tests/fixtures';
mkdirSync(dir, { recursive: true });

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const still = (file, source, size, quality = 4) =>
  ffmpeg('-f', 'lavfi', '-i', `${source}=size=${size}:rate=1`, '-frames:v', '1', '-q:v', String(quality), `${dir}/${file}`);

/** Inserts an EXIF APP1 segment carrying only the Orientation tag right after SOI. */
function withOrientation(jpeg, orientation) {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF header, IFD0 at offset 8
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // 0x0112 SHORT x1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const length = exif.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), exif]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

still('photo-1.jpg', 'testsrc2', '1200x800');
still('photo-2.jpg', 'smptehdbars', '1200x800');
still('photo-3.jpg', 'mandelbrot', '600x900');
still('photo-4.jpg', 'rgbtestsrc', '1000x1000');
still('photo-5.jpg', 'testsrc', '1600x900');
still('photo-large.jpg', 'testsrc2', '4000x3000', 12);
still('base-rotated.jpg', 'testsrc2', '1200x800');
writeFileSync(`${dir}/photo-rotated.jpg`, withOrientation(readFileSync(`${dir}/base-rotated.jpg`), 6));
unlinkSync(`${dir}/base-rotated.jpg`);
writeFileSync(`${dir}/not-an-image.jpg`, 'this is not a jpeg');
ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=5:sample_rate=22050', '-ac', '1', '-c:a', 'pcm_s16le', `${dir}/tone-5s.wav`);
console.log('fixtures written to', dir);
```

Run: `npm run fixtures && ls tests/fixtures`
Expected: `not-an-image.jpg photo-1.jpg … photo-5.jpg photo-large.jpg photo-rotated.jpg tone-5s.wav`

- [ ] **Step 10: e2e 輔助與冒煙測試**

`tests/e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const fixture = (name: string): string => path.resolve('tests/fixtures', name);

export const b64 = (name: string): string => readFileSync(fixture(name)).toString('base64');

/** Loads a Vite-served source module into the page and exposes it as window[key]. */
export async function loadModule(page: Page, modulePath: string, key: string): Promise<void> {
  await page.addScriptTag({ type: 'module', content: `import * as m from '${modulePath}'; window['${key}'] = m;` });
  await page.waitForFunction((k) => k in window, key);
}

export const DEFAULT_PHOTOS = ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg'];

export async function fillSetup(
  page: Page,
  opts: { name: string; duration: string; resolution: string; photos?: string[] },
): Promise<void> {
  await page.goto('/');
  await page.setInputFiles('#photo-input', (opts.photos ?? DEFAULT_PHOTOS).map(fixture));
  await page.fill('#name', opts.name);
  await page.fill('#keywords', '勇氣, 旅行, family, 2026');
  await page.selectOption('#duration', opts.duration);
  await page.selectOption('#resolution', opts.resolution);
  await page.click('#generate');
  await expect(page.locator('#stage')).toBeVisible({ timeout: 120_000 });
}
```
（`fillSetup` 在 Task 10 之後才會用到。）

`tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('the app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('The Museum of Me');
  await expect(page.locator('#setup-form')).toBeVisible();
});
```

Run: `npx playwright test tests/e2e/smoke.spec.ts`
Expected: PASS（1 passed）

- [ ] **Step 11: 型別檢查並提交**

Run: `npm run typecheck`
Expected: 無錯誤

```bash
git add -A
git commit -m "chore: scaffold Vite + three.js project with shared types, utils and fixtures"
```

---

### Task 2: 時長分配 `plan/timeline.ts`

**Files:**
- Create: `src/plan/timeline.ts`
- Test: `tests/unit/timeline.test.ts`

**Interfaces:**
- Consumes: `SceneId`, `SCENE_ORDER`, `DurationMode`, `Timeline`, `SceneSpan`, `GalleryStop`（Task 1）
- Produces: `interface TimelineInput { photoCount: number; durationMode: DurationMode; hasKeywords: boolean }`、`enabledScenes(input): SceneId[]`、`buildTimeline(input): Timeline`、常數 `GALLERY_SECONDS_PER_PHOTO = 3`、`AUTO_GALLERY_MAX = 120`、`MIN_STOP = 2`、`MAX_PER_STOP = 3`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/timeline.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildTimeline, enabledScenes } from '../../src/plan/timeline';
import type { DurationMode, Timeline } from '../../src/types';

const durations = (tl: Timeline) => Object.fromEntries(tl.scenes.map((s) => [s.id, +(s.end - s.start).toFixed(6)]));

function expectInvariants(tl: Timeline, n: number): void {
  expect(tl.scenes[0].start).toBe(0);
  for (let i = 1; i < tl.scenes.length; i++) expect(tl.scenes[i].start).toBeCloseTo(tl.scenes[i - 1].end, 9);
  expect(tl.scenes.at(-1)!.end).toBeCloseTo(tl.total, 9);
  const gallery = tl.scenes.find((s) => s.id === 'gallery')!;
  expect(tl.galleryStops[0].start).toBeCloseTo(gallery.start, 9);
  expect(tl.galleryStops.at(-1)!.end).toBeCloseTo(gallery.end, 9);
  for (let i = 1; i < tl.galleryStops.length; i++) {
    expect(tl.galleryStops[i].start).toBeCloseTo(tl.galleryStops[i - 1].end, 9);
  }
  const shown = tl.galleryStops.flatMap((s) => s.photoIndices);
  expect(new Set(shown).size).toBe(shown.length);
  for (const i of shown) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(n);
  }
  for (const s of tl.galleryStops) {
    expect(s.photoIndices.length).toBeGreaterThan(0);
    expect(s.photoIndices.length).toBeLessThanOrEqual(3);
  }
}

describe('buildTimeline', () => {
  it('auto mode, 10 photos with keywords uses every scene and 3 s per photo', () => {
    const tl = buildTimeline({ photoCount: 10, durationMode: 'auto', hasKeywords: true });
    expect(tl.scenes.map((s) => s.id)).toEqual(['opening', 'hall', 'corridor', 'gallery', 'keywords', 'network', 'finale']);
    expect(tl.total).toBe(76);
    expect(tl.galleryStops).toHaveLength(10);
    tl.galleryStops.forEach((s, i) => {
      expect(s.photoIndices).toEqual([i]);
      expect(s.end - s.start).toBeCloseTo(3, 9);
    });
    expectInvariants(tl, 10);
  });

  it('auto mode, 40 photos sits exactly at the 120 s cap with single stops', () => {
    const tl = buildTimeline({ photoCount: 40, durationMode: 'auto', hasKeywords: false });
    expect(durations(tl).gallery).toBe(120);
    expect(tl.galleryStops).toHaveLength(40);
  });

  it('auto mode caps the gallery at 120 s and pairs photos above 40', () => {
    const tl = buildTimeline({ photoCount: 60, durationMode: 'auto', hasKeywords: true });
    expect(durations(tl).gallery).toBe(120);
    expect(tl.galleryStops).toHaveLength(30);
    tl.galleryStops.forEach((s) => {
      expect(s.photoIndices).toHaveLength(2);
      expect(s.end - s.start).toBeGreaterThanOrEqual(3);
    });
    expectInvariants(tl, 60);
  });

  it('30 s mode drops keywords and network and uses the short durations', () => {
    const tl = buildTimeline({ photoCount: 10, durationMode: 30, hasKeywords: true });
    expect(tl.scenes.map((s) => s.id)).toEqual(['opening', 'hall', 'corridor', 'gallery', 'finale']);
    expect(durations(tl)).toEqual({ opening: 4, hall: 5, corridor: 5, gallery: 10, finale: 6 });
    expect(tl.total).toBe(30);
    expect(tl.galleryStops).toHaveLength(5);
    expect(tl.galleryStops.every((s) => s.photoIndices.length === 2)).toBe(true);
  });

  it('30 s mode with 60 photos shows only the first 15 in the gallery', () => {
    const tl = buildTimeline({ photoCount: 60, durationMode: 30, hasKeywords: false });
    expect(tl.galleryStops).toHaveLength(5);
    expect(tl.galleryStops.flatMap((s) => s.photoIndices)).toEqual(Array.from({ length: 15 }, (_, i) => i));
  });

  it('skips the keyword room when there are no keywords', () => {
    const tl = buildTimeline({ photoCount: 12, durationMode: 60, hasKeywords: false });
    expect(tl.scenes.map((s) => s.id)).not.toContain('keywords');
    expect(durations(tl).gallery).toBe(22);
    expect(tl.galleryStops).toHaveLength(6);
  });

  it('fixed modes always total exactly the chosen length', () => {
    for (const mode of [30, 60, 90, 120] as const) {
      for (const n of [1, 3, 17, 60]) {
        for (const hasKeywords of [true, false]) {
          expect(buildTimeline({ photoCount: n, durationMode: mode, hasKeywords }).total).toBeCloseTo(mode, 9);
        }
      }
    }
  });

  it('holds its invariants across photo counts and modes', () => {
    const modes: DurationMode[] = ['auto', 30, 60, 90, 120];
    for (const n of [1, 2, 3, 7, 13, 29, 40, 41, 59, 60]) {
      for (const durationMode of modes) {
        for (const hasKeywords of [true, false]) {
          expectInvariants(buildTimeline({ photoCount: n, durationMode, hasKeywords }), n);
        }
      }
    }
  });

  it('rejects non-positive or fractional photo counts', () => {
    expect(() => buildTimeline({ photoCount: 0, durationMode: 'auto', hasKeywords: false })).toThrow();
    expect(() => buildTimeline({ photoCount: 2.5, durationMode: 'auto', hasKeywords: false })).toThrow();
  });
});

describe('enabledScenes', () => {
  it('auto mode without keywords only drops the keyword room', () => {
    expect(enabledScenes({ photoCount: 5, durationMode: 'auto', hasKeywords: false })).toEqual([
      'opening', 'hall', 'corridor', 'gallery', 'network', 'finale',
    ]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/timeline.test.ts`
Expected: FAIL（`Cannot find module '../../src/plan/timeline'`）

- [ ] **Step 3: 實作 `src/plan/timeline.ts`**

```ts
import { SCENE_ORDER, type DurationMode, type GalleryStop, type SceneId, type SceneSpan, type Timeline } from '../types';

export const GALLERY_SECONDS_PER_PHOTO = 3;
export const AUTO_GALLERY_MAX = 120;
export const MIN_STOP = 2;
export const MAX_PER_STOP = 3;

type FixedScene = Exclude<SceneId, 'gallery'>;

const BASE: Record<FixedScene, number> = { opening: 6, hall: 8, corridor: 8, keywords: 8, network: 8, finale: 8 };
const SHORT: Record<FixedScene, number> = { ...BASE, opening: 4, hall: 5, corridor: 5, finale: 6 };

export interface TimelineInput {
  photoCount: number;
  durationMode: DurationMode;
  hasKeywords: boolean;
}

export function enabledScenes(input: TimelineInput): SceneId[] {
  return SCENE_ORDER.filter((id) => {
    if (id === 'keywords') return input.hasKeywords && input.durationMode !== 30;
    if (id === 'network') return input.durationMode !== 30;
    return true;
  });
}

interface GalleryPlan {
  seconds: number;
  perStop: number;
  shown: number;
}

function planGallery(n: number, mode: DurationMode, fixedSeconds: number): GalleryPlan {
  if (mode === 'auto') {
    const wanted = n * GALLERY_SECONDS_PER_PHOTO;
    return { seconds: Math.min(wanted, AUTO_GALLERY_MAX), perStop: wanted <= AUTO_GALLERY_MAX ? 1 : 2, shown: n };
  }
  const seconds = mode - fixedSeconds;
  const perStop = [1, 2, 3].find((p) => seconds / Math.ceil(n / p) >= MIN_STOP);
  if (perStop !== undefined) return { seconds, perStop, shown: n };
  return { seconds, perStop: MAX_PER_STOP, shown: Math.min(n, Math.floor(seconds / MIN_STOP) * MAX_PER_STOP) };
}

export function buildTimeline(input: TimelineInput): Timeline {
  const n = input.photoCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`photoCount must be a positive integer, got ${n}`);

  const ids = enabledScenes(input);
  const table = input.durationMode === 30 ? SHORT : BASE;
  const fixedSeconds = ids.reduce((sum, id) => (id === 'gallery' ? sum : sum + table[id]), 0);
  const gallery = planGallery(n, input.durationMode, fixedSeconds);

  const scenes: SceneSpan[] = [];
  let cursor = 0;
  for (const id of ids) {
    const seconds = id === 'gallery' ? gallery.seconds : table[id];
    scenes.push({ id, start: cursor, end: cursor + seconds });
    cursor += seconds;
  }

  const span = scenes.find((s) => s.id === 'gallery')!;
  const stopCount = Math.ceil(gallery.shown / gallery.perStop);
  const stopSeconds = gallery.seconds / stopCount;
  const galleryStops: GalleryStop[] = Array.from({ length: stopCount }, (_, k) => {
    const first = k * gallery.perStop;
    const last = Math.min(first + gallery.perStop, gallery.shown);
    return {
      start: span.start + k * stopSeconds,
      end: k === stopCount - 1 ? span.end : span.start + (k + 1) * stopSeconds,
      photoIndices: Array.from({ length: last - first }, (_, j) => first + j),
    };
  });

  return { total: cursor, scenes, galleryStops };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/timeline.test.ts`
Expected: PASS（10 passed）

- [ ] **Step 5: 提交**

```bash
git add src/plan tests/unit/timeline.test.ts
git commit -m "feat: add timeline planner that allocates scene and gallery durations"
```

---

### Task 3: 建築與展品配置 `museum/layout.ts`

**Files:**
- Create: `src/museum/layout.ts`
- Test: `tests/unit/layout.test.ts`

**Interfaces:**
- Consumes: `Timeline`, `SceneId`, `Vec3`（Task 1）；`buildTimeline`（測試用，Task 2）；`mulberry32`, `lerp`
- Produces（後續 Task 依賴這些名稱）:
  - 常數 `EYE`, `DOOR`, `WALL_T`, `ROOM_GAP`, `FRAME_SIDE`, `CORRIDOR`, `GALLERY`, `KEYWORDS`, `NETWORK`
  - `interface Room { id: SceneId; z0: number; z1: number; width: number; height: number; entryDoor: boolean; exitDoor: boolean }`
  - `interface WallBox { center: Vec3; normal: Vec3; width: number; height: number }`
  - `interface PhotoSlot extends WallBox { photoIndex: number }`
  - `interface GalleryStopLayout { photoIndices: number[]; slots: PhotoSlot[]; plaque: WallBox; center: Vec3; width: number; camera: Vec3; target: Vec3 }`
  - `interface KeywordItem { text: string; center: Vec3; height: number; width: number }`
  - `interface NetworkLayout { center: Vec3; nodes: Vec3[]; edges: [number, number][]; nodeSize: number }`
  - `interface Layout { rooms: Room[]; title: WallBox; hallPortrait: PhotoSlot; corridorSlots: PhotoSlot[]; galleryStops: GalleryStopLayout[]; keywords: KeywordItem[]; network: NetworkLayout | null; finalePortrait: PhotoSlot; visitor: Vec3 }`
  - `interface LayoutInput { timeline: Timeline; aspects: number[]; portraitIndex: number; keywords: string[]; seed: number }`
  - `computeLayout(input): Layout`、`getRoom(layout, id): Room`、`roomCenterZ(room): number`
  - `fitBox(aspect, maxW, maxH): { width; height }`、`fitFramed(aspect, maxW, maxH): { width; height }`（回傳照片本身尺寸，使含框外框不超過 max）、`framedOuter(w, h): { width; height }`、`estimateTextWidth(text): number`（以字高為單位）

- [ ] **Step 1: 寫失敗的測試 `tests/unit/layout.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  CORRIDOR, GALLERY, KEYWORDS, NETWORK, ROOM_GAP, computeLayout, estimateTextWidth, fitFramed, framedOuter, getRoom,
} from '../../src/museum/layout';
import { buildTimeline } from '../../src/plan/timeline';
import type { DurationMode } from '../../src/types';

const aspectsFor = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78, 0.5][i % 5]);

function make(n: number, durationMode: DurationMode = 'auto', keywords: string[] = ['勇氣', 'travel', '家人']) {
  const timeline = buildTimeline({ photoCount: n, durationMode, hasKeywords: keywords.length > 0 });
  return { timeline, layout: computeLayout({ timeline, aspects: aspectsFor(n), portraitIndex: 2 % n, keywords, seed: 7 }) };
}

describe('fitFramed', () => {
  it('keeps the framed outer size inside the box and preserves the aspect ratio', () => {
    for (const aspect of [0.3, 0.5, 0.75, 1, 4 / 3, 1.5, 2, 4]) {
      for (const [w, h] of [[0.86, 0.86], [3.4, 2.4], [1.55, 1.8], [6, 4.6]]) {
        const size = fitFramed(aspect, w, h);
        const outer = framedOuter(size.width, size.height);
        expect(outer.width).toBeLessThanOrEqual(w + 1e-9);
        expect(outer.height).toBeLessThanOrEqual(h + 1e-9);
        expect(Math.max(w - outer.width, h - outer.height) >= -1e-9).toBe(true);
        expect(Math.min(Math.abs(w - outer.width), Math.abs(h - outer.height))).toBeLessThan(1e-9);
        expect(size.width / size.height).toBeCloseTo(aspect, 9);
      }
    }
  });
});

describe('computeLayout', () => {
  it('lays rooms out in scene order along -Z with a wall gap between them', () => {
    const { timeline, layout } = make(10);
    expect(layout.rooms.map((r) => r.id)).toEqual(timeline.scenes.map((s) => s.id));
    expect(layout.rooms[0].z0).toBe(0);
    for (let i = 1; i < layout.rooms.length; i++) {
      expect(layout.rooms[i].z0).toBeCloseTo(layout.rooms[i - 1].z1 - ROOM_GAP, 9);
    }
    expect(layout.rooms[0].entryDoor).toBe(false);
    expect(layout.rooms.at(-1)!.exitDoor).toBe(false);
    expect(layout.rooms.slice(1).every((r) => r.entryDoor)).toBe(true);
    expect(layout.rooms.slice(0, -1).every((r) => r.exitDoor)).toBe(true);
  });

  it('hangs every photo once in the corridor, inside the room and within its row', () => {
    for (const n of [1, 6, 7, 60]) {
      const { layout } = make(n);
      const room = getRoom(layout, 'corridor');
      expect(layout.corridorSlots.map((s) => s.photoIndex)).toEqual(Array.from({ length: n }, (_, i) => i));
      for (const slot of layout.corridorSlots) {
        const outer = framedOuter(slot.width, slot.height);
        expect(outer.width).toBeLessThanOrEqual(CORRIDOR.outerMax + 1e-9);
        expect(outer.height).toBeLessThanOrEqual(CORRIDOR.outerMax + 1e-9);
        expect(slot.center[2]).toBeLessThan(room.z0 - 0.5);
        expect(slot.center[2]).toBeGreaterThan(room.z1 + 0.5);
        expect(Math.abs(slot.center[0])).toBeCloseTo(CORRIDOR.width / 2, 9);
        expect(slot.normal[0]).toBe(-Math.sign(slot.center[0]));
      }
    }
  });

  it('gallery stops mirror the timeline and stay inside the gallery room without overlapping', () => {
    for (const [n, mode] of [[10, 'auto'], [60, 'auto'], [60, 30], [5, 120]] as const) {
      const { timeline, layout } = make(n, mode);
      const room = getRoom(layout, 'gallery');
      expect(layout.galleryStops.map((s) => s.photoIndices)).toEqual(timeline.galleryStops.map((s) => s.photoIndices));
      let previousMinZ = Infinity;
      for (const stop of layout.galleryStops) {
        expect(stop.width).toBeLessThanOrEqual(GALLERY.groupMaxWidth + 1e-9);
        const zs = [
          ...stop.slots.flatMap((s) => [s.center[2] + framedOuter(s.width, s.height).width / 2, s.center[2] - framedOuter(s.width, s.height).width / 2]),
          stop.plaque.center[2] - stop.plaque.width / 2,
        ];
        const maxZ = Math.max(...zs);
        const minZ = Math.min(...zs);
        expect(maxZ).toBeLessThan(previousMinZ);
        expect(maxZ).toBeLessThan(room.z0);
        expect(minZ).toBeGreaterThan(room.z1);
        previousMinZ = minZ;
        expect(stop.camera[0]).toBeCloseTo(-GALLERY.width / 2 + GALLERY.cameraDistance, 9);
      }
    }
  });

  it('places the hall and finale portraits from the chosen portrait photo', () => {
    const { layout } = make(10);
    expect(layout.hallPortrait.photoIndex).toBe(2);
    expect(layout.finalePortrait.photoIndex).toBe(2);
    expect(layout.hallPortrait.width / layout.hallPortrait.height).toBeCloseTo(1, 9);
    expect(layout.finalePortrait.normal).toEqual([0, 0, 1]);
  });

  it('scatters keywords deterministically inside the keyword volume', () => {
    const words = Array.from({ length: 40 }, (_, i) => (i % 2 ? `word${i}` : `關鍵字${i}`));
    const a = make(10, 'auto', words).layout;
    const b = make(10, 'auto', words).layout;
    expect(a.keywords).toEqual(b.keywords);
    expect(a.keywords).toHaveLength(40);
    const room = getRoom(a, 'keywords');
    const zc = (room.z0 + room.z1) / 2;
    for (const item of a.keywords) {
      expect(Math.abs(item.center[0]) + item.width / 2).toBeLessThanOrEqual(KEYWORDS.halfWidth + 1e-9);
      expect(item.center[1]).toBeGreaterThanOrEqual(KEYWORDS.minY);
      expect(item.center[1]).toBeLessThanOrEqual(KEYWORDS.maxY);
      expect(Math.abs(item.center[2] - zc)).toBeLessThanOrEqual(KEYWORDS.halfDepth);
      expect(item.height).toBeLessThanOrEqual(KEYWORDS.maxHeight);
    }
    expect(a.keywords[0].height).toBeGreaterThan(a.keywords[39].height);
  });

  it('shrinks a very long keyword so it still fits the room width', () => {
    const { layout } = make(5, 'auto', ['這是一段非常非常非常非常非常非常長的關鍵字短語']);
    expect(layout.keywords[0].width).toBeLessThanOrEqual(2 * KEYWORDS.halfWidth - 1 + 1e-9);
  });

  it('builds a network sphere with one node per photo and nearest-neighbour edges', () => {
    for (const n of [1, 2, 3, 60]) {
      const { layout } = make(n);
      const net = layout.network!;
      expect(net.nodes).toHaveLength(n);
      if (n > 1) for (const p of net.nodes) expect(Math.hypot(...p)).toBeCloseTo(NETWORK.radius, 6);
      const keys = net.edges.map(([a, b]) => `${a}-${b}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const [a, b] of net.edges) {
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(n);
      }
      if (n === 1) expect(net.edges).toEqual([]);
      if (n >= 2) {
        const degree = new Array(n).fill(0);
        net.edges.forEach(([a, b]) => { degree[a]++; degree[b]++; });
        expect(Math.min(...degree)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('omits the keyword and network rooms when the timeline drops them', () => {
    const { layout } = make(10, 30);
    expect(layout.keywords).toEqual([]);
    expect(layout.network).toBeNull();
    expect(() => getRoom(layout, 'network')).toThrow();
  });

  it('estimates CJK text wider than latin text of the same length', () => {
    expect(estimateTextWidth('家人朋友')).toBeGreaterThan(estimateTextWidth('abcd'));
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/layout.test.ts`
Expected: FAIL（找不到 `../../src/museum/layout`）

- [ ] **Step 3: 實作 `src/museum/layout.ts`**

```ts
import type { SceneId, Timeline, Vec3 } from '../types';
import { lerp } from '../util/math';
import { mulberry32 } from '../util/rng';

export const EYE = 1.6;
export const DOOR = { width: 3.2, height: 3.6 } as const;
export const WALL_T = 0.15;
export const ROOM_GAP = WALL_T * 2;
/** Mat + molding on each side of a photo, as a fraction of the photo's longer edge. */
export const FRAME_SIDE = 0.12;

export const CORRIDOR = {
  width: 6, height: 4.5, perColumn: 6, colSpacing: 1.6, firstColumn: 3, rowY: [1.15, 2.1, 3.05], outerMax: 0.86,
} as const;
export const GALLERY = {
  width: 10, height: 5, spacing: 4.6, firstStop: 3.5, groupMaxWidth: 3.4, gap: 0.3,
  singleMaxHeight: 2.4, multiMaxHeight: 1.8, centerY: 1.75, cameraDistance: 3.3,
} as const;
export const KEYWORDS = { halfWidth: 6, minY: 3.2, maxY: 6.2, halfDepth: 3.5, maxHeight: 0.9, minHeight: 0.35 } as const;
export const NETWORK = { radius: 3.2, centerY: 4.4 } as const;

const FIXED_ROOMS = {
  opening: { width: 14, height: 7, length: 10 },
  hall: { width: 14, height: 8, length: 14 },
  keywords: { width: 16, height: 8, length: 16 },
  network: { width: 16, height: 10, length: 16 },
  finale: { width: 14, height: 8, length: 16 },
} as const;

export interface Room {
  id: SceneId;
  z0: number;
  z1: number;
  width: number;
  height: number;
  entryDoor: boolean;
  exitDoor: boolean;
}

export interface WallBox {
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
}

export interface PhotoSlot extends WallBox {
  photoIndex: number;
}

export interface GalleryStopLayout {
  photoIndices: number[];
  slots: PhotoSlot[];
  plaque: WallBox;
  /** Centre of the photo group on the wall. */
  center: Vec3;
  /** Total framed width of the photo group along the wall. */
  width: number;
  camera: Vec3;
  target: Vec3;
}

export interface KeywordItem {
  text: string;
  center: Vec3;
  height: number;
  width: number;
}

export interface NetworkLayout {
  center: Vec3;
  /** Node positions relative to `center`. */
  nodes: Vec3[];
  edges: [number, number][];
  nodeSize: number;
}

export interface Layout {
  rooms: Room[];
  title: WallBox;
  hallPortrait: PhotoSlot;
  corridorSlots: PhotoSlot[];
  galleryStops: GalleryStopLayout[];
  keywords: KeywordItem[];
  network: NetworkLayout | null;
  finalePortrait: PhotoSlot;
  visitor: Vec3;
}

export interface LayoutInput {
  timeline: Timeline;
  aspects: number[];
  portraitIndex: number;
  keywords: string[];
  seed: number;
}

export function getRoom(layout: Layout, id: SceneId): Room {
  const room = layout.rooms.find((r) => r.id === id);
  if (!room) throw new Error(`room "${id}" is not part of this layout`);
  return room;
}

export const roomCenterZ = (room: Room): number => (room.z0 + room.z1) / 2;

export function fitBox(aspect: number, maxW: number, maxH: number): { width: number; height: number } {
  return aspect >= maxW / maxH ? { width: maxW, height: maxW / aspect } : { width: maxH * aspect, height: maxH };
}

export function framedOuter(width: number, height: number): { width: number; height: number } {
  const side = FRAME_SIDE * Math.max(width, height);
  return { width: width + 2 * side, height: height + 2 * side };
}

/** Photo size whose framed outer size fits inside maxW × maxH. */
export function fitFramed(aspect: number, maxW: number, maxH: number): { width: number; height: number } {
  const k = 2 * FRAME_SIDE * Math.max(aspect, 1);
  const height = Math.min(maxW / (aspect + k), maxH / (1 + k));
  return { width: aspect * height, height };
}

/** Rough text width in units of the text height (CJK ≈ 1 em, latin ≈ 0.6 em, plus padding). */
export function estimateTextWidth(text: string): number {
  let width = 0.6;
  for (const ch of text) width += ch.codePointAt(0)! >= 0x2e80 ? 1 : 0.6;
  return width;
}

function roomSize(id: SceneId, photoCount: number, stopCount: number): { width: number; height: number; length: number } {
  if (id === 'corridor') {
    const columns = Math.ceil(photoCount / CORRIDOR.perColumn);
    return { width: CORRIDOR.width, height: CORRIDOR.height, length: Math.max(20, columns * CORRIDOR.colSpacing + 6) };
  }
  if (id === 'gallery') return { width: GALLERY.width, height: GALLERY.height, length: stopCount * GALLERY.spacing + 3 };
  return FIXED_ROOMS[id];
}

function portraitSlot(photoIndex: number, aspect: number, center: Vec3, normal: Vec3, maxW: number, maxH: number): PhotoSlot {
  return { photoIndex, center, normal, ...fitFramed(aspect, maxW, maxH) };
}

function corridorSlots(room: Room, aspects: number[]): PhotoSlot[] {
  return aspects.map((aspect, photoIndex) => {
    const column = Math.floor(photoIndex / CORRIDOR.perColumn);
    const k = photoIndex % CORRIDOR.perColumn;
    const side = k < 3 ? -1 : 1;
    const z = room.z0 - CORRIDOR.firstColumn - column * CORRIDOR.colSpacing - (side > 0 ? CORRIDOR.colSpacing / 2 : 0);
    return {
      photoIndex,
      center: [side * (CORRIDOR.width / 2), CORRIDOR.rowY[k % 3], z],
      normal: [-side, 0, 0],
      ...fitFramed(aspect, CORRIDOR.outerMax, CORRIDOR.outerMax),
    };
  });
}

function galleryStops(room: Room, timeline: Timeline, aspects: number[]): GalleryStopLayout[] {
  const wallX = -GALLERY.width / 2;
  return timeline.galleryStops.map((stop, k) => {
    const zk = room.z0 - GALLERY.firstStop - k * GALLERY.spacing;
    const count = stop.photoIndices.length;
    const cellW = (GALLERY.groupMaxWidth - (count - 1) * GALLERY.gap) / count;
    const cellH = count === 1 ? GALLERY.singleMaxHeight : GALLERY.multiMaxHeight;
    const sizes = stop.photoIndices.map((i) => fitFramed(aspects[i], cellW, cellH));
    const outers = sizes.map((s) => framedOuter(s.width, s.height).width);
    const width = outers.reduce((a, b) => a + b, 0) + (count - 1) * GALLERY.gap;
    // Facing the left wall (looking -X) the viewer's right is -Z, so the first photo sits at +Z.
    let cursor = zk + width / 2;
    const slots = stop.photoIndices.map((photoIndex, j): PhotoSlot => {
      const z = cursor - outers[j] / 2;
      cursor -= outers[j] + GALLERY.gap;
      return { photoIndex, center: [wallX, GALLERY.centerY, z], normal: [1, 0, 0], ...sizes[j] };
    });
    const focusZ = zk - 0.25;
    return {
      photoIndices: [...stop.photoIndices],
      slots,
      plaque: { center: [wallX, 1.3, zk - width / 2 - 0.5], normal: [1, 0, 0], width: 0.62, height: 0.42 },
      center: [wallX, GALLERY.centerY, zk],
      width,
      camera: [wallX + GALLERY.cameraDistance, EYE, focusZ],
      target: [wallX, 1.7, focusZ],
    };
  });
}

function keywordItems(room: Room, words: string[], seed: number): KeywordItem[] {
  const rnd = mulberry32(seed);
  const zc = roomCenterZ(room);
  const maxWidth = 2 * KEYWORDS.halfWidth - 1;
  const items: KeywordItem[] = [];
  const overlaps = (o: KeywordItem, c: Vec3, w: number, h: number) =>
    Math.abs(o.center[2] - c[2]) < 1 &&
    Math.abs(o.center[0] - c[0]) < (o.width + w) / 2 + 0.15 &&
    Math.abs(o.center[1] - c[1]) < (o.height + h) / 2 + 0.15;

  words.forEach((text, i) => {
    const est = estimateTextWidth(text);
    let height = words.length === 1 ? KEYWORDS.maxHeight : lerp(KEYWORDS.maxHeight, KEYWORDS.minHeight, i / (words.length - 1));
    if (est * height > maxWidth) height = maxWidth / est;
    const width = est * height;
    let center: Vec3 = [0, KEYWORDS.minY, zc];
    for (let attempt = 0; attempt < 40; attempt++) {
      center = [
        lerp(-KEYWORDS.halfWidth + width / 2, KEYWORDS.halfWidth - width / 2, rnd()),
        lerp(KEYWORDS.minY, KEYWORDS.maxY, rnd()),
        lerp(zc - KEYWORDS.halfDepth, zc + KEYWORDS.halfDepth, rnd()),
      ];
      if (!items.some((o) => overlaps(o, center, width, height))) break;
    }
    items.push({ text, center, height, width });
  });
  return items;
}

function fibonacciSphere(n: number, radius: number): Vec3[] {
  if (n === 1) return [[0, 0, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i): Vec3 => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius];
  });
}

function nearestEdges(nodes: Vec3[]): [number, number][] {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  nodes.forEach((p, i) => {
    const nearest = nodes
      .map((q, j) => ({ j, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of nearest) {
      const edge: [number, number] = [Math.min(i, j), Math.max(i, j)];
      const key = `${edge[0]}-${edge[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(edge);
      }
    }
  });
  return edges;
}

export function computeLayout(input: LayoutInput): Layout {
  const { timeline, aspects } = input;
  const n = aspects.length;
  if (n === 0) throw new Error('layout needs at least one photo');
  const portraitIndex = Math.min(Math.max(0, input.portraitIndex), n - 1);
  const portraitAspect = aspects[portraitIndex];

  let z = 0;
  const rooms = timeline.scenes.map((scene, i): Room => {
    const size = roomSize(scene.id, n, timeline.galleryStops.length);
    const room: Room = {
      id: scene.id, z0: z, z1: z - size.length, width: size.width, height: size.height,
      entryDoor: i > 0, exitDoor: i < timeline.scenes.length - 1,
    };
    z = room.z1 - ROOM_GAP;
    return room;
  });
  const find = (id: SceneId) => rooms.find((r) => r.id === id);
  const need = (id: SceneId) => {
    const room = find(id);
    if (!room) throw new Error(`timeline is missing required scene "${id}"`);
    return room;
  };

  const opening = need('opening');
  const hall = need('hall');
  const finale = need('finale');
  const keywordRoom = find('keywords');
  const networkRoom = find('network');
  const nodes = fibonacciSphere(n, NETWORK.radius);

  return {
    rooms,
    title: { center: [0, 5.25, opening.z1], normal: [0, 0, 1], width: 11, height: 2.6 },
    hallPortrait: portraitSlot(portraitIndex, portraitAspect, [-hall.width / 2, 3.8, roomCenterZ(hall)], [1, 0, 0], 6, 4.6),
    corridorSlots: corridorSlots(need('corridor'), aspects),
    galleryStops: galleryStops(need('gallery'), timeline, aspects),
    keywords: keywordRoom ? keywordItems(keywordRoom, input.keywords, input.seed) : [],
    network: networkRoom
      ? {
          center: [0, NETWORK.centerY, roomCenterZ(networkRoom)],
          nodes,
          edges: nearestEdges(nodes),
          nodeSize: n > 30 ? 0.45 : 0.6,
        }
      : null,
    finalePortrait: portraitSlot(portraitIndex, portraitAspect, [0, 3.9, finale.z1], [0, 0, 1], 7.5, 5.2),
    visitor: [0.35, 0, finale.z1 + 4.5],
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/layout.test.ts`
Expected: PASS（10 passed）

- [ ] **Step 5: 提交**

```bash
git add src/museum/layout.ts tests/unit/layout.test.ts
git commit -m "feat: add pure museum layout (rooms, frames, keywords, network sphere)"
```

---
### Task 4: 鏡頭路徑 `camera/hermite.ts` 與 `camera/keys.ts`

**Files:**
- Create: `src/camera/hermite.ts`, `src/camera/keys.ts`
- Test: `tests/unit/camera.test.ts`

**Interfaces:**
- Consumes: `Layout`, `Room`, `EYE`, `ROOM_GAP`, `roomCenterZ`（Task 3）；`Timeline`, `SceneSpan`, `Vec3`（Task 1）；`clamp`
- Produces:
  - `interface Keyframe { t: number; pos: Vec3; target: Vec3; hold: boolean }`
  - `interface CameraPose { pos: Vec3; target: Vec3 }`
  - `interface CameraPath { readonly duration: number; poseAt(t: number): CameraPose }`
  - `createCameraPath(keys: Keyframe[]): CameraPath`
  - `interface Waypoint { pos: Vec3; target: Vec3; dwell?: number }`
  - `allocateKeys(start: number, end: number, points: Waypoint[]): Keyframe[]`
  - `buildCameraKeys(timeline: Timeline, layout: Layout): Keyframe[]`

設計重點：位置與注視點各自以三次 Hermite 插值；`hold` 關鍵影格切線為 0（停留時完全靜止、無過衝），其餘關鍵影格用非均勻 Catmull-Rom 切線，保證速度連續。每個場景把「上一扇門 → 場景 waypoint → 下一扇門」串起來，停留時間之外的時間依距離（加上轉向角 × 1.2）比例分配，因此場景內速度均勻。

- [ ] **Step 1: 寫失敗的測試 `tests/unit/camera.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createCameraPath, type Keyframe } from '../../src/camera/hermite';
import { allocateKeys, buildCameraKeys } from '../../src/camera/keys';
import { DOOR, KEYWORDS, NETWORK, computeLayout, getRoom, type Layout } from '../../src/museum/layout';
import { buildTimeline } from '../../src/plan/timeline';
import type { DurationMode, Vec3 } from '../../src/types';

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

describe('allocateKeys', () => {
  it('spans the scene exactly and honours dwell times', () => {
    const keys = allocateKeys(10, 20, [
      { pos: [0, 1.6, 0], target: [0, 1.6, -5] },
      { pos: [0, 1.6, -6], target: [0, 1.6, -11], dwell: 3 },
      { pos: [0, 1.6, -12], target: [0, 1.6, -17] },
    ]);
    expect(keys[0].t).toBe(10);
    expect(keys.at(-1)!.t).toBe(20);
    const holds = keys.filter((k) => k.hold);
    expect(holds).toHaveLength(2);
    expect(holds[1].t - holds[0].t).toBeCloseTo(3, 9);
    for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThan(keys[i - 1].t);
  });

  it('splits movement time in proportion to distance', () => {
    const keys = allocateKeys(0, 10, [
      { pos: [0, 0, 0], target: [0, 0, -1] },
      { pos: [0, 0, -2], target: [0, 0, -3] },
      { pos: [0, 0, -8], target: [0, 0, -9] },
    ]);
    // weights are 0.05 + distance: 2.05 and 6.05
    expect(keys[1].t).toBeCloseTo((10 * 2.05) / 8.1, 9);
  });

  it('scales dwell down when it would exceed 80% of the scene', () => {
    const keys = allocateKeys(0, 5, [
      { pos: [0, 0, 0], target: [0, 0, -1], dwell: 10 },
      { pos: [0, 0, -4], target: [0, 0, -5] },
    ]);
    expect(keys[1].t - keys[0].t).toBeCloseTo(4, 9);
  });
});

const SCENARIOS: [number, DurationMode, boolean][] = [
  [3, 'auto', true], [10, 'auto', true], [41, 'auto', false], [60, 'auto', true],
  [3, 30, false], [60, 30, true], [12, 60, false], [5, 90, true], [60, 120, true],
];

function scenario(n: number, durationMode: DurationMode, hasKeywords: boolean) {
  const timeline = buildTimeline({ photoCount: n, durationMode, hasKeywords });
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78][i % 4]);
  const layout = computeLayout({ timeline, aspects, portraitIndex: 0, keywords: hasKeywords ? ['一', 'two', '三四五'] : [], seed: 3 });
  const keys = buildCameraKeys(timeline, layout);
  return { timeline, layout, keys, path: createCameraPath(keys), label: `${n} photos / ${durationMode} / kw=${hasKeywords}` };
}

function violation(layout: Layout, [x, y, z]: Vec3): string | null {
  const inDoor = Math.abs(x) <= DOOR.width / 2 - 0.25 && y >= 0.3 && y <= DOOR.height - 0.25;
  const room = layout.rooms.find((r) => z <= r.z0 && z >= r.z1);
  if (!room) return inDoor ? null : `between rooms outside the doorway (x=${x.toFixed(2)}, y=${y.toFixed(2)})`;
  if (Math.abs(x) > room.width / 2 - 0.35) return `too close to a side wall of ${room.id} (x=${x.toFixed(2)})`;
  if (y < 0.3 || y > room.height - 0.3) return `outside floor/ceiling of ${room.id} (y=${y.toFixed(2)})`;
  const nearEnd = room.z0 - z < 0.35 || z - room.z1 < 0.35;
  if (nearEnd && !inDoor) return `too close to an end wall of ${room.id} (x=${x.toFixed(2)}, z=${z.toFixed(2)})`;
  return null;
}

describe('buildCameraKeys', () => {
  it('covers the whole timeline with strictly increasing keys', () => {
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, keys } = scenario(n, mode, kw);
      expect(keys[0].t).toBe(0);
      expect(keys.at(-1)!.t).toBeCloseTo(timeline.total, 9);
      for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThan(keys[i - 1].t);
    }
  });

  it('never leaves the rooms or clips a wall', () => {
    const problems: string[] = [];
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, layout, path, label } = scenario(n, mode, kw);
      for (let t = 0; t <= timeline.total; t += 0.05) {
        const v = violation(layout, path.poseAt(t).pos);
        if (v) problems.push(`${label} t=${t.toFixed(2)}: ${v}`);
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('keeps clear of the network sphere', () => {
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, layout, path } = scenario(n, mode, kw);
      if (!layout.network) continue;
      const span = timeline.scenes.find((s) => s.id === 'network')!;
      const c = layout.network.center;
      for (let t = span.start; t <= span.end; t += 0.05) {
        const [x, y, z] = path.poseAt(t).pos;
        expect(Math.hypot(x - c[0], y - c[1], z - c[2])).toBeGreaterThan(NETWORK.radius + 0.9);
      }
    }
  });

  it('passes underneath the hanging keywords', () => {
    const { layout, path, timeline } = scenario(10, 'auto', true);
    const room = getRoom(layout, 'keywords');
    for (let t = 0; t <= timeline.total; t += 0.05) {
      const [, y, z] = path.poseAt(t).pos;
      if (z <= room.z0 && z >= room.z1) expect(y).toBeLessThan(KEYWORDS.minY - 0.8);
    }
  });

  it('moves calmly in auto mode and sanely in every mode', () => {
    for (const [n, mode, kw] of SCENARIOS) {
      const { timeline, path, label } = scenario(n, mode, kw);
      const dt = 0.05;
      let max = 0;
      for (let t = 0; t + dt <= timeline.total; t += dt) {
        const a = path.poseAt(t).pos;
        const b = path.poseAt(t + dt).pos;
        max = Math.max(max, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dt);
      }
      expect(max, label).toBeLessThan(mode === 'auto' ? 5 : 9);
    }
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/camera.test.ts`
Expected: FAIL（找不到 `../../src/camera/hermite`）

- [ ] **Step 3: 實作 `src/camera/hermite.ts`**

```ts
import type { Vec3 } from '../types';

export interface Keyframe {
  t: number;
  pos: Vec3;
  target: Vec3;
  /** Zero tangent: the camera comes to rest exactly on this key. */
  hold: boolean;
}

export interface CameraPose {
  pos: Vec3;
  target: Vec3;
}

export interface CameraPath {
  readonly duration: number;
  poseAt(t: number): CameraPose;
}

function tangents(keys: Keyframe[], get: (k: Keyframe) => Vec3): Vec3[] {
  return keys.map((k, i) => {
    if (k.hold || i === 0 || i === keys.length - 1) return [0, 0, 0];
    const p = get(keys[i - 1]);
    const n = get(keys[i + 1]);
    const dt = keys[i + 1].t - keys[i - 1].t;
    return [(n[0] - p[0]) / dt, (n[1] - p[1]) / dt, (n[2] - p[2]) / dt];
  });
}

function segmentIndex(keys: Keyframe[], t: number): number {
  let lo = 0;
  let hi = keys.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function hermite(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, h: number, u: number): Vec3 {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const at = (j: 0 | 1 | 2) => h00 * p0[j] + h10 * h * m0[j] + h01 * p1[j] + h11 * h * m1[j];
  return [at(0), at(1), at(2)];
}

export function createCameraPath(keys: Keyframe[]): CameraPath {
  if (keys.length < 2) throw new Error('camera path needs at least two keyframes');
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i].t > keys[i - 1].t)) throw new Error(`keyframe times must strictly increase (index ${i})`);
  }
  const posTangents = tangents(keys, (k) => k.pos);
  const targetTangents = tangents(keys, (k) => k.target);
  const first = keys[0].t;
  const last = keys[keys.length - 1].t;

  return {
    duration: last,
    poseAt(t: number): CameraPose {
      const tc = Math.min(last, Math.max(first, t));
      const i = segmentIndex(keys, tc);
      const a = keys[i];
      const b = keys[i + 1];
      const h = b.t - a.t;
      const u = (tc - a.t) / h;
      return {
        pos: hermite(a.pos, b.pos, posTangents[i], posTangents[i + 1], h, u),
        target: hermite(a.target, b.target, targetTangents[i], targetTangents[i + 1], h, u),
      };
    },
  };
}
```

- [ ] **Step 4: 實作 `src/camera/keys.ts`**

```ts
import { EYE, ROOM_GAP, roomCenterZ, type Layout, type Room } from '../museum/layout';
import type { SceneSpan, Timeline, Vec3 } from '../types';
import { clamp } from '../util/math';
import type { Keyframe } from './hermite';

export interface Waypoint {
  pos: Vec3;
  target: Vec3;
  /** Seconds to rest on this waypoint. */
  dwell?: number;
}

const PAN_WEIGHT = 1.2;
const MIN_WEIGHT = 0.05;
const MAX_DWELL_SHARE = 0.8;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

function direction(w: Waypoint): Vec3 {
  const d = sub(w.target, w.pos);
  const l = norm(d) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

const angle = (a: Vec3, b: Vec3): number => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));

/** The doorway leading out of `room`, centred in the wall gap. */
export function doorWaypoint(room: Room): Waypoint {
  const z = room.z1 - ROOM_GAP / 2;
  return { pos: [0, EYE, z], target: [0, EYE, z - 8] };
}

export function allocateKeys(start: number, end: number, points: Waypoint[]): Keyframe[] {
  if (points.length === 0) throw new Error('a scene needs at least one waypoint');
  const span = end - start;
  let dwells = points.map((p) => Math.max(0, p.dwell ?? 0));
  const dwellSum = dwells.reduce((a, b) => a + b, 0);
  if (dwellSum > span * MAX_DWELL_SHARE) dwells = dwells.map((d) => (d * span * MAX_DWELL_SHARE) / dwellSum);
  const move = span - dwells.reduce((a, b) => a + b, 0);
  const weights = points
    .slice(1)
    .map((p, i) => MIN_WEIGHT + norm(sub(p.pos, points[i].pos)) + PAN_WEIGHT * angle(direction(points[i]), direction(p)));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const keys: Keyframe[] = [];
  let t = start;
  points.forEach((p, i) => {
    const hold = dwells[i] > 0;
    keys.push({ t, pos: p.pos, target: p.target, hold });
    if (hold) {
      t += dwells[i];
      keys.push({ t, pos: p.pos, target: p.target, hold: true });
    }
    if (i < weights.length) t += (move * weights[i]) / weightSum;
  });
  keys[keys.length - 1].t = end;
  return keys;
}

function sceneWaypoints(span: SceneSpan, room: Room, layout: Layout, timeline: Timeline): Waypoint[] {
  const d = span.end - span.start;
  const zc = roomCenterZ(room);
  const { z0, z1 } = room;
  switch (span.id) {
    case 'opening':
      return [
        { pos: [0, EYE, z0 - 2.5], target: [0, 4.6, z1], dwell: 0.35 * d },
        { pos: [0, EYE, z0 - 5.5], target: [0, 3.4, z1] },
      ];
    case 'hall': {
      const p = layout.hallPortrait.center;
      return [
        { pos: [-0.8, EYE, z0 - 4], target: p },
        { pos: [-1.3, EYE, zc + 0.4], target: p, dwell: 0.3 * d }, // ~5.7 from the wall frames the whole portrait
        { pos: [-1.0, EYE, z1 + 3.5], target: [0, EYE, z1 - 4] },
      ];
    }
    case 'corridor':
      return [
        { pos: [0, EYE, z0 - 2], target: [0.9, 1.9, z0 - 8] },
        { pos: [0, EYE, z1 + 2], target: [-0.9, 1.9, z1 - 4] },
      ];
    case 'gallery':
      return layout.galleryStops.map((stop, k) => {
        const s = timeline.galleryStops[k];
        return { pos: stop.camera, target: stop.target, dwell: clamp((s.end - s.start) * 0.4, 0.5, 5) };
      });
    case 'keywords':
      return [
        { pos: [0, EYE, z0 - 2.5], target: [0, 4.2, zc] },
        { pos: [3.2, 2.0, zc + 2.5], target: [0, 4.4, zc - 1] },
        { pos: [-3.0, 2.0, zc - 2.0], target: [0, 4.4, zc - 2] },
        { pos: [-0.8, EYE, z1 + 2.5], target: [0, EYE, z1 - 4] },
      ];
    case 'network': {
      if (!layout.network) throw new Error('network scene without a network layout');
      const c = layout.network.center;
      return [
        { pos: [0, EYE, z0 - 2.5], target: c },
        { pos: [5.2, 2.6, zc + 2.2], target: c },
        { pos: [5.4, 3.0, zc - 2.4], target: c },
        { pos: [1.8, EYE, z1 + 2.2], target: [0, EYE, z1 - 4] },
      ];
    }
    case 'finale': {
      const p = layout.finalePortrait.center;
      return [
        { pos: [0, EYE, z0 - 2.5], target: [0, 3.4, z1] },
        { pos: [0.1, 1.62, z1 + 9], target: [p[0], 3.3, p[2]], dwell: 0.45 * d },
      ];
    }
  }
}

export function buildCameraKeys(timeline: Timeline, layout: Layout): Keyframe[] {
  if (timeline.scenes.length !== layout.rooms.length) throw new Error('layout does not match the timeline');
  const keys: Keyframe[] = [];
  const last = timeline.scenes.length - 1;
  timeline.scenes.forEach((span, i) => {
    const room = layout.rooms[i];
    const points: Waypoint[] = [];
    if (i > 0) points.push(doorWaypoint(layout.rooms[i - 1]));
    points.push(...sceneWaypoints(span, room, layout, timeline));
    if (i < last) points.push(doorWaypoint(room));
    for (const k of allocateKeys(span.start, span.end, points)) {
      const prev = keys[keys.length - 1];
      if (prev && Math.abs(prev.t - k.t) < 1e-9) continue; // shared doorway key between scenes
      keys.push(k);
    }
  });
  return keys;
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run tests/unit/camera.test.ts`
Expected: PASS（13 passed）。若「never leaves the rooms」失敗，錯誤訊息會列出場景與時間：只調整 `sceneWaypoints` 中該場景的 waypoint 座標（不得放寬測試門檻），再重跑。

- [ ] **Step 6: 提交**

```bash
git add src/camera tests/unit/camera.test.ts
git commit -m "feat: add Hermite camera path with per-scene waypoints and distance-based pacing"
```

---

### Task 5: 淡入淡出與片尾合成 `render/fades.ts`、`render/finish-effect.ts`

**Files:**
- Create: `src/render/fades.ts`, `src/render/finish-effect.ts`
- Test: `tests/unit/fades.test.ts`

**Interfaces:**
- Consumes: `smoothstep`（Task 1）
- Produces: `INTRO_FADE = 1.6`；`fadesAt(t: number, total: number): { white: number; card: number }`；`class FinishEffect extends Effect { constructor(card: Texture); setState(white: number, card: number, frame: number): void }`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/fades.test.ts`**

```ts
import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { INTRO_FADE, fadesAt } from '../../src/render/fades';
import { FinishEffect } from '../../src/render/finish-effect';

describe('fadesAt', () => {
  it('starts fully white and clears after the intro', () => {
    expect(fadesAt(0, 60)).toEqual({ white: 1, card: 0 });
    expect(fadesAt(INTRO_FADE, 60).white).toBe(0);
    expect(fadesAt(30, 60)).toEqual({ white: 0, card: 0 });
  });

  it('ends on white with the end card fully shown', () => {
    expect(fadesAt(60, 60)).toEqual({ white: 1, card: 1 });
  });

  it('is almost white before the card starts to appear', () => {
    const f = fadesAt(60 - 2.4, 60);
    expect(f.white).toBeGreaterThan(0.9);
    expect(f.card).toBe(0);
  });

  it('never decreases during the outro', () => {
    let prev = 0;
    for (let t = 55; t <= 60; t += 0.1) {
      const { white } = fadesAt(t, 60);
      expect(white).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = white;
    }
  });
});

describe('FinishEffect', () => {
  it('writes fade, card and grain seed uniforms', () => {
    const effect = new FinishEffect(new Texture());
    effect.setState(0.25, 0.75, 12);
    expect(effect.uniforms.get('white')!.value).toBe(0.25);
    expect(effect.uniforms.get('cardOpacity')!.value).toBe(0.75);
    expect(effect.uniforms.get('seed')!.value).toBeCloseTo(12 * 1.618, 9);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/fades.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作**

`src/render/fades.ts`:
```ts
import { smoothstep } from '../util/math';

export const INTRO_FADE = 1.6;

/** White-out and end-card opacity at time t; the finale dwell covers the last ~3.6 s. */
export function fadesAt(t: number, total: number): { white: number; card: number } {
  const intro = 1 - smoothstep(0, INTRO_FADE, t);
  const outro = smoothstep(total - 3.4, total - 2.2, t);
  return { white: Math.max(intro, outro), card: smoothstep(total - 2.4, total - 1.4, t) };
}
```

`src/render/finish-effect.ts`:
```ts
import { Effect } from 'postprocessing';
import { Uniform, type Texture } from 'three';

const fragmentShader = /* glsl */ `
uniform float white;
uniform float cardOpacity;
uniform sampler2D card;
uniform float grainAmount;
uniform float seed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c += (hash(gl_FragCoord.xy + seed) - 0.5) * grainAmount;
  c = mix(c, vec3(1.0), white);
  vec4 k = texture2D(card, uv);
  c = mix(c, k.rgb, k.a * cardOpacity);
  outputColor = vec4(c, inputColor.a);
}
`;

/** Film grain, white fades and the end card, composited after tone mapping. */
export class FinishEffect extends Effect {
  constructor(card: Texture) {
    super('FinishEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['white', new Uniform(0)],
        ['cardOpacity', new Uniform(0)],
        ['card', new Uniform(card)],
        ['grainAmount', new Uniform(0.035)],
        ['seed', new Uniform(0)],
      ]),
    });
  }

  /** `frame` seeds the grain so identical frames render identically. */
  setState(white: number, card: number, frame: number): void {
    this.uniforms.get('white')!.value = white;
    this.uniforms.get('cardOpacity')!.value = card;
    this.uniforms.get('seed')!.value = (frame % 997) * 1.618;
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/fades.test.ts`
Expected: PASS（5 passed）

- [ ] **Step 5: 提交**

```bash
git add src/render tests/unit/fades.test.ts
git commit -m "feat: add intro/outro fades and finishing effect (grain, white-out, end card)"
```

---

### Task 6: 配樂 `audio/score.ts`、`audio/soundtrack.ts`

**Files:**
- Create: `src/audio/score.ts`, `src/audio/soundtrack.ts`
- Test: `tests/unit/score.test.ts`, `tests/e2e/audio.spec.ts`

**Interfaces:**
- Consumes: `mulberry32`（Task 1）；e2e 的 `loadModule`, `b64`（Task 1）
- Produces:
  - `interface NoteEvent { time: number; midi: number; velocity: number; duration: number; voice: 'piano' | 'pad' }`；`BPM = 72`；`TAIL = 3`；`composeScore(duration: number, seed: number): NoteEvent[]`
  - `SAMPLE_RATE = 48000`；`synthesizeSoundtrack(duration: number, seed: number): Promise<AudioBuffer>`；`fitUploadedAudio(file: File, duration: number): Promise<AudioBuffer>`；`buildSoundtrack(music: File | null, duration: number, seed: number): Promise<{ buffer: AudioBuffer; warning: string | null }>`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/score.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TAIL, composeScore } from '../../src/audio/score';

describe('composeScore', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    expect(composeScore(60, 5)).toEqual(composeScore(60, 5));
    expect(composeScore(60, 5)).not.toEqual(composeScore(60, 6));
  });

  it('keeps every note inside the playable window and a sane range', () => {
    const notes = composeScore(90, 1);
    expect(notes.length).toBeGreaterThan(50);
    for (const n of notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThan(90 - TAIL);
      expect(n.midi).toBeGreaterThanOrEqual(36);
      expect(n.midi).toBeLessThanOrEqual(96);
      expect(n.velocity).toBeGreaterThan(0);
      expect(n.velocity).toBeLessThanOrEqual(1);
      expect(n.duration).toBeGreaterThan(0);
    }
  });

  it('is sorted by time and contains both voices', () => {
    const notes = composeScore(30, 2);
    for (let i = 1; i < notes.length; i++) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
    expect(new Set(notes.map((n) => n.voice))).toEqual(new Set(['piano', 'pad']));
  });

  it('returns no notes when the video is shorter than the tail', () => {
    expect(composeScore(2, 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/score.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `src/audio/score.ts`**

```ts
import { mulberry32 } from '../util/rng';

export interface NoteEvent {
  time: number;
  midi: number;
  velocity: number;
  duration: number;
  voice: 'piano' | 'pad';
}

export const BPM = 72;
/** Seconds at the end kept free of new notes so reverb and the fade-out can ring out. */
export const TAIL = 3;

const BEAT = 60 / BPM;
const BAR = 4 * BEAT;

/** Cmaj7 – Am7 – Fmaj7 – G, voiced bass first. */
const PROGRESSION = [
  [48, 55, 59, 64, 67],
  [45, 52, 55, 60, 64],
  [41, 48, 52, 57, 60],
  [43, 50, 55, 59, 62],
];
const MELODY = [72, 74, 76, 79, 81, 84];

export function composeScore(duration: number, seed: number): NoteEvent[] {
  const rnd = mulberry32(seed);
  const end = duration - TAIL;
  const events: NoteEvent[] = [];
  for (let bar = 0; bar * BAR < end; bar++) {
    const t0 = bar * BAR;
    const chord = PROGRESSION[bar % PROGRESSION.length];
    for (const midi of chord.slice(1, 4)) {
      events.push({ time: t0, midi, velocity: 0.16, duration: BAR * 1.05, voice: 'pad' });
    }
    events.push({ time: t0, midi: chord[0], velocity: 0.5, duration: BAR, voice: 'piano' });
    for (let e = 0; e < 8; e++) {
      const skip = e > 0 && rnd() < 0.25;
      if (skip) continue;
      events.push({
        time: t0 + (e * BEAT) / 2,
        midi: chord[1 + ((e + bar) % 4)],
        velocity: 0.26 + rnd() * 0.1,
        duration: BEAT * 1.5,
        voice: 'piano',
      });
    }
    if (bar >= 2) {
      for (const beat of [0, 2]) {
        if (rnd() < 0.6) {
          events.push({
            time: t0 + beat * BEAT,
            midi: MELODY[Math.floor(rnd() * MELODY.length)],
            velocity: 0.34,
            duration: BEAT * 2,
            voice: 'piano',
          });
        }
      }
    }
  }
  return events.filter((e) => e.time < end).sort((a, b) => a.time - b.time);
}
```

- [ ] **Step 4: 執行單元測試確認通過**

Run: `npx vitest run tests/unit/score.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 寫失敗的瀏覽器測試 `tests/e2e/audio.spec.ts`**（涵蓋 Review Focus #4）

```ts
import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/audio/soundtrack.ts', '__soundtrack');
});

test('synthesized soundtrack has the requested length, format and audible content', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const buf: AudioBuffer = await m.synthesizeSoundtrack(20, 7);
    const ch = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    return { duration: buf.duration, channels: buf.numberOfChannels, rate: buf.sampleRate, peak };
  });
  expect(r.duration).toBeCloseTo(20, 2);
  expect(r.channels).toBe(2);
  expect(r.rate).toBe(48000);
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.peak).toBeLessThanOrEqual(1);
});

test('uploaded music shorter than the video loops to fill it', async ({ page }) => {
  const r = await page.evaluate(async (data) => {
    const m = (window as AnyWindow).__soundtrack;
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' });
    const buf: AudioBuffer = await m.fitUploadedAudio(file, 12);
    const ch = buf.getChannelData(0);
    const rms = (from: number, to: number) => {
      let s = 0;
      const a = Math.floor(from * buf.sampleRate);
      const b = Math.floor(to * buf.sampleRate);
      for (let i = a; i < b; i++) s += ch[i] * ch[i];
      return Math.sqrt(s / (b - a));
    };
    return { duration: buf.duration, loopedRms: rms(6, 8) };
  }, b64('tone-5s.wav'));
  expect(r.duration).toBeCloseTo(12, 2);
  expect(r.loopedRms).toBeGreaterThan(0.01);
});

test('uploaded music longer than the video is trimmed and fades out', async ({ page }) => {
  const r = await page.evaluate(async (data) => {
    const m = (window as AnyWindow).__soundtrack;
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' });
    const buf: AudioBuffer = await m.fitUploadedAudio(file, 4);
    const ch = buf.getChannelData(0);
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += ch[i] * ch[i];
      return Math.sqrt(s / (b - a));
    };
    const sr = buf.sampleRate;
    return { duration: buf.duration, early: rms(Math.floor(0.6 * sr), Math.floor(0.9 * sr)), last: rms(ch.length - Math.floor(0.05 * sr), ch.length) };
  }, b64('tone-5s.wav'));
  expect(r.duration).toBeCloseTo(4, 2);
  expect(r.last).toBeLessThan(r.early * 0.2);
});

test('undecodable music falls back to the synthesized soundtrack with a warning', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const bad = new File(['definitely not audio'], 'song.mp3', { type: 'audio/mpeg' });
    const { buffer, warning } = await m.buildSoundtrack(bad, 10, 1);
    return { duration: buffer.duration, warning };
  });
  expect(r.duration).toBeCloseTo(10, 2);
  expect(r.warning).toContain('內建配樂');
});
```

Run: `npx playwright test tests/e2e/audio.spec.ts`
Expected: FAIL（`/src/audio/soundtrack.ts` 不存在，模組載入逾時）

- [ ] **Step 6: 實作 `src/audio/soundtrack.ts`**

```ts
import { mulberry32 } from '../util/rng';
import { TAIL, composeScore, type NoteEvent } from './score';

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

function playPiano(ctx: BaseAudioContext, out: AudioNode, ev: NoteEvent): void {
  const f = midiToHz(ev.midi);
  const decay = 1.2 + (96 - ev.midi) / 40;
  const stopAt = ev.time + ev.duration + decay;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, ev.time);
  env.gain.linearRampToValueAtTime(ev.velocity, ev.time + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0008, stopAt);
  env.connect(out);
  for (const [harmonic, amp] of [[1, 1], [2, 0.45], [3, 0.18], [4, 0.08]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * harmonic;
    osc.detune.value = harmonic * 0.7;
    const g = ctx.createGain();
    g.gain.value = amp * 0.35;
    osc.connect(g).connect(env);
    osc.start(ev.time);
    osc.stop(stopAt + 0.05);
  }
}

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

export async function synthesizeSoundtrack(duration: number, seed: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = masterChain(ctx, duration, 0.8);
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulseResponse(ctx, 3.2, seed);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  bus.connect(dry).connect(master);
  bus.connect(reverb).connect(wet).connect(master);
  for (const ev of composeScore(duration, seed)) {
    if (ev.voice === 'piano') playPiano(ctx, bus, ev);
    else playPad(ctx, bus, ev);
  }
  return ctx.startRendering();
}

export async function fitUploadedAudio(file: File, duration: number): Promise<AudioBuffer> {
  const decoded = await new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(await file.arrayBuffer());
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.loop = decoded.duration < duration;
  source.connect(masterChain(ctx, duration, 1));
  source.start(0);
  return ctx.startRendering();
}

export async function buildSoundtrack(
  music: File | null,
  duration: number,
  seed: number,
): Promise<{ buffer: AudioBuffer; warning: string | null }> {
  if (music) {
    try {
      return { buffer: await fitUploadedAudio(music, duration), warning: null };
    } catch {
      return { buffer: await synthesizeSoundtrack(duration, seed), warning: `無法讀取音樂檔「${music.name}」，已改用內建配樂` };
    }
  }
  return { buffer: await synthesizeSoundtrack(duration, seed), warning: null };
}
```

（`masterChain` 在影片長度不足 `TAIL + FADE_IN` 時會讓時間點重疊；這種長度只會出現在測試中的 4 秒片段，Web Audio 會依序套用排程，結尾仍為 0。）

- [ ] **Step 7: 執行瀏覽器測試確認通過**

Run: `npx playwright test tests/e2e/audio.spec.ts`
Expected: PASS（4 passed）

- [ ] **Step 8: 提交**

```bash
git add src/audio tests/unit/score.test.ts tests/e2e/audio.spec.ts
git commit -m "feat: add seeded ambient piano score and soundtrack rendering/fitting"
```

---
### Task 7: 照片與文字貼圖 `assets/`

**Files:**
- Create: `src/assets/texture-factory.ts`, `src/assets/text.ts`, `src/assets/photos.ts`
- Test: `tests/unit/photos.test.ts`, `tests/e2e/photos.spec.ts`

**Interfaces:**
- Produces:
  - `interface TextLine { text: string; px: number; weight?: 300 | 400 | 500 | 700; spacing?: number; color?: string }`
  - `interface TextSpec { lines: TextLine[]; color?: string; background?: string; padding?: number; lineGap?: number; align?: 'center' | 'left'; size?: { width: number; height: number } }`
  - `interface TextTexture { texture: Texture; aspect: number }`；`interface TextureFactory { text(spec: TextSpec): TextTexture; glow(): Texture }`
  - `FONT_STACK`；`ensureFonts(texts: string[]): Promise<void>`；`createCanvasTextureFactory(): TextureFactory`
  - `MAX_TEXTURE_EDGE = 1600`；`interface PhotoAsset { texture: Texture; aspect: number; sourceIndex: number }`；`fitWithin(w, h, maxEdge): { width; height }`；`loadPhotos(files: File[]): Promise<{ photos: PhotoAsset[]; failed: string[] }>`

- [ ] **Step 1: 寫失敗的單元測試 `tests/unit/photos.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { MAX_TEXTURE_EDGE, fitWithin } from '../../src/assets/photos';

describe('fitWithin', () => {
  it('leaves small images untouched', () => {
    expect(fitWithin(800, 600, MAX_TEXTURE_EDGE)).toEqual({ width: 800, height: 600 });
  });

  it('scales the longer edge down to the limit for landscape and portrait images', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never returns a zero dimension', () => {
    expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/photos.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `src/assets/texture-factory.ts` 與 `src/assets/photos.ts`**

`src/assets/texture-factory.ts`:
```ts
import type { Texture } from 'three';

export interface TextLine {
  text: string;
  px: number;
  weight?: 300 | 400 | 500 | 700;
  spacing?: number;
  color?: string;
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
```

`src/assets/photos.ts`:
```ts
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

export const MAX_TEXTURE_EDGE = 1600;

export interface PhotoAsset {
  texture: Texture;
  aspect: number;
  /** Index of the originating file in the user's list. */
  sourceIndex: number;
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function loadPhotos(files: File[]): Promise<{ photos: PhotoAsset[]; failed: string[] }> {
  const photos: PhotoAsset[] = [];
  const failed: string[] = [];
  for (const [sourceIndex, file] of files.entries()) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const size = fitWithin(bitmap.width, bitmap.height, MAX_TEXTURE_EDGE);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      bitmap.close();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      photos.push({ texture, aspect: size.width / size.height, sourceIndex });
    } catch {
      failed.push(file.name);
    }
  }
  return { photos, failed };
}
```

- [ ] **Step 4: 執行單元測試確認通過**

Run: `npx vitest run tests/unit/photos.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 寫失敗的瀏覽器測試 `tests/e2e/photos.spec.ts`**（涵蓋 Review Focus #1、#2）

```ts
import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;

test('loadPhotos honours EXIF orientation, downsizes large photos and reports undecodable files', async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/assets/photos.ts', '__photos');
  const files = ['photo-1.jpg', 'photo-rotated.jpg', 'not-an-image.jpg', 'photo-large.jpg'].map((name) => ({ name, data: b64(name) }));
  const r = await page.evaluate(async (list) => {
    const m = (window as AnyWindow).__photos;
    const inputs = list.map(({ name, data }) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' }));
    const { photos, failed } = await m.loadPhotos(inputs);
    return {
      failed,
      sources: photos.map((p: any) => p.sourceIndex),
      aspects: photos.map((p: any) => p.aspect),
      sizes: photos.map((p: any) => [p.texture.image.width, p.texture.image.height]),
    };
  }, files);
  expect(r.failed).toEqual(['not-an-image.jpg']);
  expect(r.sources).toEqual([0, 1, 3]);
  expect(r.aspects[0]).toBeCloseTo(1.5, 2);
  expect(r.aspects[1]).toBeCloseTo(800 / 1200, 2);
  expect(r.sizes[2]).toEqual([1600, 1200]);
});

test('text factory sizes canvases to their content or to a fixed size', async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/assets/text.ts', '__text');
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__text;
    await m.ensureFonts(['小明']);
    const f = m.createCanvasTextureFactory();
    const line = f.text({ lines: [{ text: 'THE MUSEUM OF 小明', px: 64 }] });
    const fixed = f.text({ size: { width: 1920, height: 1080 }, lines: [{ text: '小明', px: 120 }] });
    const empty = f.text({ lines: [{ text: '   ', px: 40 }] });
    return { line: line.aspect, fixed: fixed.aspect, fixedW: fixed.texture.image.width, empty: empty.aspect, glow: f.glow().image.width };
  });
  expect(r.line).toBeGreaterThan(4);
  expect(r.fixed).toBeCloseTo(16 / 9, 6);
  expect(r.fixedW).toBe(1920);
  expect(Number.isFinite(r.empty)).toBe(true);
  expect(r.glow).toBe(256);
});
```

Run: `npx playwright test tests/e2e/photos.spec.ts`
Expected: 第 1 個測試 PASS（`photos.ts` 已存在）；第 2 個 FAIL（`/src/assets/text.ts` 不存在）

- [ ] **Step 6: 實作 `src/assets/text.ts`**

```ts
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { TextLine, TextSpec, TextTexture, TextureFactory } from './texture-factory';

export const FONT_STACK = '"Noto Sans TC", "Noto Sans JP", system-ui, sans-serif';
const FONT_WEIGHTS = [300, 500, 700] as const;

/** Loads the Noto Sans TC unicode-range subsets needed for `texts` before canvases are drawn. */
export async function ensureFonts(texts: string[]): Promise<void> {
  const sample = Array.from(new Set(texts.join(''))).join('') || 'A';
  try {
    await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 32px "Noto Sans TC"`, sample)));
  } catch {
    // Offline or blocked: canvases fall back to the next font in FONT_STACK.
  }
}

const fontOf = (line: TextLine): string => `${line.weight ?? 400} ${line.px}px ${FONT_STACK}`;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createCanvasTextureFactory(): TextureFactory {
  return {
    text(spec: TextSpec): TextTexture {
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
    },

    glow(): Texture {
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
    },
  };
}
```

- [ ] **Step 7: 執行瀏覽器測試確認通過**

Run: `npx playwright test tests/e2e/photos.spec.ts`
Expected: PASS（2 passed）

- [ ] **Step 8: 提交**

```bash
git add src/assets tests/unit/photos.test.ts tests/e2e/photos.spec.ts
git commit -m "feat: add photo loading (EXIF-aware, 1600px cap) and canvas text textures"
```

---

### Task 8: 美術館場景 `museum/`

**Files:**
- Create: `src/museum/materials.ts`, `src/museum/architecture.ts`, `src/museum/frame.ts`, `src/museum/text-plane.ts`, `src/museum/visitor.ts`, `src/museum/context.ts`, `src/museum/scenes/opening.ts`, `src/museum/scenes/hall.ts`, `src/museum/scenes/corridor.ts`, `src/museum/scenes/gallery.ts`, `src/museum/scenes/keywords.ts`, `src/museum/scenes/network.ts`, `src/museum/scenes/finale.ts`, `src/museum/build.ts`
- Test: `tests/unit/museum.test.ts`

**Interfaces:**
- Consumes: `Layout`, `Room`, `PhotoSlot`, `WallBox`, `DOOR`, `WALL_T`, `ROOM_GAP`, `FRAME_SIDE`, `fitBox`（Task 3）；`PhotoAsset`, `TextureFactory`, `TextTexture`（Task 7）；`Timeline`, `SceneSpan`, `SceneId`, `Vec3`；`truncate`
- Produces:
  - `interface MuseumContent { photos: PhotoAsset[]; captions: string[]; portraitIndex: number; name: string; subtitle: string; date: string; keywords: string[] }`
  - `interface MuseumScene { scene: Scene; update(t: number): void; dispose(): void }`
  - `buildMuseum(timeline, layout, content, tex): MuseumScene`
  - 物件名稱（測試與除錯用）：`'title'`、`'network'`、`'keywords'`、`'visitor'`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/museum.test.ts`**（涵蓋 Review Focus #3）

```ts
import { Group, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import type { PhotoAsset } from '../../src/assets/photos';
import type { TextureFactory } from '../../src/assets/texture-factory';
import { buildMuseum, type MuseumScene } from '../../src/museum/build';
import { computeLayout } from '../../src/museum/layout';
import { buildTimeline } from '../../src/plan/timeline';
import type { DurationMode } from '../../src/types';

const fakeTex = (aspect = 4): TextureFactory => ({
  text: () => ({ texture: new Texture(), aspect }),
  glow: () => new Texture(),
});

const fakePhotos = (n: number): PhotoAsset[] =>
  Array.from({ length: n }, (_, i) => ({ texture: new Texture(), aspect: i % 3 === 0 ? 0.75 : 1.5, sourceIndex: i }));

function setup(n: number, durationMode: DurationMode = 'auto', opts: { name?: string; textAspect?: number } = {}) {
  const keywords = ['勇氣', 'travel'];
  const timeline = buildTimeline({ photoCount: n, durationMode, hasKeywords: true });
  const photos = fakePhotos(n);
  const layout = computeLayout({ timeline, aspects: photos.map((p) => p.aspect), portraitIndex: 1, keywords, seed: 1 });
  const content = {
    photos,
    captions: photos.map((_, i) => (i % 2 ? `說明 ${i}` : '')),
    portraitIndex: 1,
    name: opts.name ?? '小明',
    subtitle: '2026',
    date: '2026.09.28',
    keywords,
  };
  const museum = buildMuseum(timeline, layout, content, fakeTex(opts.textAspect));
  return { timeline, layout, photos, content, museum };
}

function countPhotoMeshes(museum: MuseumScene, texture: Texture): number {
  let count = 0;
  museum.scene.traverse((o) => {
    if (o instanceof Mesh && o.material instanceof MeshBasicMaterial && o.material.map === texture) count++;
  });
  return count;
}

describe('buildMuseum', () => {
  it('hangs each photo in the corridor, in the gallery when shown, and the portrait in hall and finale', () => {
    for (const [n, mode] of [[10, 'auto'], [60, 30]] as const) {
      const { timeline, photos, museum } = setup(n, mode);
      const shown = new Set(timeline.galleryStops.flatMap((s) => s.photoIndices));
      photos.forEach((p, i) => {
        const expected = 1 + (shown.has(i) ? 1 : 0) + (i === 1 ? 2 : 0);
        expect(countPhotoMeshes(museum, p.texture), `photo ${i} (${n} / ${mode})`).toBe(expected);
      });
    }
  });

  it('a very long name still fits the title box', () => {
    const { layout, museum } = setup(5, 'auto', { name: '非常非常非常非常非常非常非常非常非常非常長的名字', textAspect: 30 });
    const title = museum.scene.getObjectByName('title') as Mesh;
    const geometry = title.geometry as PlaneGeometry;
    expect(geometry.parameters.width).toBeLessThanOrEqual(layout.title.width + 1e-9);
    expect(geometry.parameters.height).toBeLessThanOrEqual(layout.title.height + 1e-9);
  });

  it('rotates the network deterministically with time', () => {
    const { museum, timeline } = setup(10);
    const network = museum.scene.getObjectByName('network') as Group;
    const span = timeline.scenes.find((s) => s.id === 'network')!;
    museum.update(span.start + 1);
    const a = network.rotation.y;
    museum.update(span.start + 3);
    const b = network.rotation.y;
    museum.update(span.start + 1);
    expect(network.rotation.y).toBe(a);
    expect(b).not.toBe(a);
    let lines = 0;
    network.traverse((o) => { if (o instanceof LineSegments) lines++; });
    expect(lines).toBe(1);
  });

  it('places the visitor in the finale and leaves out rooms the timeline dropped', () => {
    const { museum } = setup(10, 30);
    expect(museum.scene.getObjectByName('visitor')).toBeDefined();
    expect(museum.scene.getObjectByName('network')).toBeUndefined();
    expect(museum.scene.getObjectByName('keywords')).toBeUndefined();
  });

  it('rejects content that does not match the layout', () => {
    const { timeline, layout, content } = setup(5);
    expect(() => buildMuseum(timeline, layout, { ...content, photos: content.photos.slice(0, 4) }, fakeTex())).toThrow();
  });

  it('disposes without throwing', () => {
    const { museum } = setup(5);
    expect(() => museum.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/museum.test.ts`
Expected: FAIL（找不到 `../../src/museum/build`）

- [ ] **Step 3: 共用零件**

`src/museum/materials.ts`:
```ts
import { AdditiveBlending, LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial, type Texture } from 'three';

export interface Materials {
  wall: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  skylight: MeshBasicMaterial;
  frame: MeshStandardMaterial;
  mat: MeshStandardMaterial;
  visitor: MeshStandardMaterial;
  thread: LineBasicMaterial;
  edge: LineBasicMaterial;
  glow: MeshBasicMaterial;
  /** One unlit material per photo texture, shared by every frame showing it. */
  photo(texture: Texture): MeshBasicMaterial;
  dispose(): void;
}

export function createMaterials(glowTexture: Texture): Materials {
  const wall = new MeshStandardMaterial({ color: 0xf3f2ef, roughness: 0.92, metalness: 0 });
  const floor = new MeshStandardMaterial({ color: 0xd4d1cb, roughness: 0.42, metalness: 0 });
  const ceiling = new MeshStandardMaterial({ color: 0xf7f7f5, roughness: 1 });
  const skylight = new MeshBasicMaterial({ color: 0xffffff });
  const frame = new MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.55 });
  const mat = new MeshStandardMaterial({ color: 0xfbfbfa, roughness: 1 });
  const visitor = new MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.85 });
  const thread = new LineBasicMaterial({ color: 0xb8b8bc });
  const edge = new LineBasicMaterial({ color: 0x8e8e93 });
  const glow = new MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false });
  const photos = new Map<Texture, MeshBasicMaterial>();
  const shared = [wall, floor, ceiling, skylight, frame, mat, visitor, thread, edge, glow];
  return {
    wall, floor, ceiling, skylight, frame, mat, visitor, thread, edge, glow,
    photo(texture) {
      let m = photos.get(texture);
      if (!m) {
        m = new MeshBasicMaterial({ map: texture });
        photos.set(texture, m);
      }
      return m;
    },
    dispose() {
      shared.forEach((m) => m.dispose());
      glowTexture.dispose();
      photos.forEach((m) => m.dispose());
      photos.clear();
    },
  };
}
```

`src/museum/architecture.ts`:
```ts
import { BoxGeometry, Group, Mesh, PlaneGeometry, type Material } from 'three';
import { DOOR, ROOM_GAP, WALL_T, type Room } from './layout';
import type { Materials } from './materials';

function box(material: Material, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** End wall at depth z; a doorway is cut by building it from three boxes, which also gives the jambs faces. */
function endWall(material: Material, width: number, height: number, z: number, door: boolean): Mesh[] {
  const full = width + 2 * WALL_T;
  if (!door) return [box(material, full, height, WALL_T, 0, height / 2, z)];
  const side = (full - DOOR.width) / 2;
  return [
    box(material, side, height, WALL_T, -(DOOR.width / 2 + side / 2), height / 2, z),
    box(material, side, height, WALL_T, DOOR.width / 2 + side / 2, height / 2, z),
    box(material, DOOR.width, height - DOOR.height, WALL_T, 0, DOOR.height + (height - DOOR.height) / 2, z),
  ];
}

/** Floor, ceiling with skylight, and walls; walls sit outside the room's inner bounds. */
export function buildRoomShell(room: Room, mats: Materials): Group {
  const group = new Group();
  group.name = `shell:${room.id}`;
  const { width, height, z0, z1 } = room;
  const length = z0 - z1;
  const zc = (z0 + z1) / 2;

  const floor = new Mesh(new PlaneGeometry(width, length), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zc);
  const ceiling = new Mesh(new PlaneGeometry(width, length), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, zc);
  const skylight = new Mesh(new PlaneGeometry(Math.max(1, width - 4), Math.max(1, length - 4)), mats.skylight);
  skylight.rotation.x = Math.PI / 2;
  skylight.position.set(0, height - 0.02, zc);
  group.add(floor, ceiling, skylight);

  for (const side of [-1, 1]) {
    group.add(box(mats.wall, WALL_T, height, length + 2 * WALL_T, side * (width / 2 + WALL_T / 2), height / 2, zc));
  }
  group.add(...endWall(mats.wall, width, height, z0 + WALL_T / 2, room.entryDoor));
  group.add(...endWall(mats.wall, width, height, z1 - WALL_T / 2, room.exitDoor));

  if (room.exitDoor) {
    const threshold = new Mesh(new PlaneGeometry(DOOR.width, ROOM_GAP), mats.floor);
    threshold.rotation.x = -Math.PI / 2;
    threshold.position.set(0, 0, z1 - ROOM_GAP / 2);
    group.add(threshold);
  }
  return group;
}
```

`src/museum/frame.ts`:
```ts
import { BoxGeometry, Group, Mesh, PlaneGeometry, type Object3D } from 'three';
import type { PhotoAsset } from '../assets/photos';
import type { Vec3 } from '../types';
import { FRAME_SIDE, type PhotoSlot } from './layout';
import type { Materials } from './materials';

/** Share of FRAME_SIDE taken by the white mat; the rest shows as dark molding. */
const MAT_SHARE = 0.75;
const DEPTH = 0.05;

/** Positions obj on a wall so that its local +Z faces along the wall normal. */
export function placeOnWall(obj: Object3D, box: { center: Vec3; normal: Vec3 }, offset = 0): void {
  const [x, y, z] = box.center;
  const [nx, , nz] = box.normal;
  obj.position.set(x + nx * offset, y, z + nz * offset);
  obj.rotation.set(0, Math.atan2(nx, nz), 0);
}

export function createFramedPhoto(slot: PhotoSlot, photo: PhotoAsset, mats: Materials): Group {
  const { width: w, height: h } = slot;
  const side = FRAME_SIDE * Math.max(w, h);
  const mat = side * MAT_SHARE;
  const group = new Group();
  group.name = `frame:${slot.photoIndex}`;
  const molding = new Mesh(new BoxGeometry(w + 2 * side, h + 2 * side, DEPTH), mats.frame);
  molding.position.z = DEPTH / 2;
  const board = new Mesh(new PlaneGeometry(w + 2 * mat, h + 2 * mat), mats.mat);
  board.position.z = DEPTH + 0.002;
  const picture = new Mesh(new PlaneGeometry(w, h), mats.photo(photo.texture));
  picture.position.z = DEPTH + 0.004;
  group.add(molding, board, picture);
  placeOnWall(group, slot);
  return group;
}

/** Soft additive light pool on the wall, standing in for a gallery spotlight. */
export function createGlow(mats: Materials, center: Vec3, normal: Vec3, width: number, height: number): Mesh {
  const glow = new Mesh(new PlaneGeometry(width, height), mats.glow);
  placeOnWall(glow, { center, normal }, 0.01);
  return glow;
}
```

`src/museum/text-plane.ts`:
```ts
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { TextTexture } from '../assets/texture-factory';
import { fitBox } from './layout';

/** A transparent plane showing `text`, as large as fits in maxWidth × maxHeight. */
export function createTextPlane(text: TextTexture, maxWidth: number, maxHeight: number): Mesh {
  const size = fitBox(text.aspect, maxWidth, maxHeight);
  const material = new MeshBasicMaterial({ map: text.texture, transparent: true, depthWrite: false });
  material.userData.ownsMap = true;
  return new Mesh(new PlaneGeometry(size.width, size.height), material);
}
```

`src/museum/visitor.ts`:
```ts
import { CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry, type Material } from 'three';

/** A faceless, low-detail standing figure about 1.84 m tall, feet at y = 0. */
export function createVisitor(material: Material): Group {
  const group = new Group();
  group.name = 'visitor';
  const part = (geometry: BufferGeometry, x: number, y: number): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    group.add(mesh);
    return mesh;
  };
  const leg = new CapsuleGeometry(0.075, 0.72, 6, 12);
  part(leg, -0.1, 0.46);
  part(leg, 0.1, 0.46);
  part(new CapsuleGeometry(0.17, 0.46, 6, 16), 0, 1.18).scale.set(1.15, 1, 0.7);
  const arm = new CapsuleGeometry(0.055, 0.56, 6, 12);
  part(arm, -0.27, 1.13).rotation.z = 0.08;
  part(arm, 0.27, 1.13).rotation.z = -0.08;
  part(new CylinderGeometry(0.05, 0.06, 0.1, 12), 0, 1.6);
  part(new SphereGeometry(0.11, 20, 16), 0, 1.73).scale.set(0.9, 1.05, 1);
  return group;
}
```

`src/museum/context.ts`:
```ts
import type { Group } from 'three';
import type { PhotoAsset } from '../assets/photos';
import type { TextureFactory } from '../assets/texture-factory';
import type { SceneSpan } from '../types';
import type { Layout, Room } from './layout';
import type { Materials } from './materials';

export interface MuseumContent {
  photos: PhotoAsset[];
  captions: string[];
  portraitIndex: number;
  name: string;
  subtitle: string;
  /** Already formatted for display, e.g. "2026.09.28". */
  date: string;
  keywords: string[];
}

export interface SceneContext {
  room: Room;
  span: SceneSpan;
  layout: Layout;
  content: MuseumContent;
  tex: TextureFactory;
  mats: Materials;
}

export interface SceneObject {
  group: Group;
  update?: (t: number) => void;
}
```

- [ ] **Step 4: 各場景**

`src/museum/scenes/opening.ts`:
```ts
import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { placeOnWall } from '../frame';
import { createTextPlane } from '../text-plane';

export function buildOpening({ layout, content, tex }: SceneContext): SceneObject {
  const group = new Group();
  const text = tex.text({
    lines: [
      { text: 'THE MUSEUM OF', px: 64, weight: 300, spacing: 18 },
      { text: content.name, px: 150, weight: 700, spacing: 6 },
      { text: content.subtitle, px: 52, weight: 300, spacing: 8 },
    ],
  });
  const title = createTextPlane(text, layout.title.width, layout.title.height);
  title.name = 'title';
  placeOnWall(title, layout.title, 0.01);
  group.add(title);
  return { group };
}
```

`src/museum/scenes/hall.ts`:
```ts
import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto, createGlow } from '../frame';

export function buildHall({ layout, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  const slot = layout.hallPortrait;
  group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
  const [x, y, z] = slot.center;
  group.add(createGlow(mats, [x, y + slot.height * 0.25, z], slot.normal, slot.width * 1.9, slot.height * 1.7));
  return { group };
}
```

`src/museum/scenes/corridor.ts`:
```ts
import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto } from '../frame';

export function buildCorridor({ layout, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  for (const slot of layout.corridorSlots) group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
  return { group };
}
```

`src/museum/scenes/gallery.ts`:
```ts
import { BoxGeometry, Group, Mesh } from 'three';
import type { TextLine } from '../../assets/texture-factory';
import { truncate } from '../../util/format';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto, createGlow, placeOnWall } from '../frame';
import { createTextPlane } from '../text-plane';

export function buildGallery({ layout, content, tex, mats }: SceneContext): SceneObject {
  const group = new Group();
  for (const stop of layout.galleryStops) {
    for (const slot of stop.slots) group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
    const normal = stop.slots[0].normal;
    group.add(createGlow(mats, [stop.center[0], stop.center[1] + 0.5, stop.center[2]], normal, stop.width * 1.4, 3));

    const numbers = stop.photoIndices.map((i) => String(i + 1).padStart(2, '0'));
    const label = numbers.length === 1 ? `No. ${numbers[0]}` : `No. ${numbers[0]}–${numbers[numbers.length - 1]}`;
    const captionLines: TextLine[] = stop.photoIndices
      .map((i) => content.captions[i] ?? '')
      .filter((c) => c.trim() !== '')
      .map((c) => ({ text: truncate(c, 24), px: 30, weight: 300 }));
    const text = tex.text({
      lines: [{ text: label, px: 34, weight: 500, spacing: 2 }, ...captionLines],
      background: '#ffffff',
      padding: 30,
      align: 'left',
    });
    const backing = new Mesh(new BoxGeometry(stop.plaque.width + 0.03, stop.plaque.height + 0.03, 0.02), mats.mat);
    placeOnWall(backing, stop.plaque, 0.01);
    const face = createTextPlane(text, stop.plaque.width, stop.plaque.height);
    placeOnWall(face, stop.plaque, 0.021);
    group.add(backing, face);
  }
  return { group };
}
```

`src/museum/scenes/keywords.ts`:
```ts
import { BufferGeometry, Group, Line, Vector3 } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createTextPlane } from '../text-plane';

export function buildKeywords({ layout, room, tex, mats }: SceneContext): SceneObject {
  const group = new Group();
  group.name = 'keywords';
  const holders = layout.keywords.map((item) => {
    const holder = new Group();
    holder.position.set(...item.center);
    const text = tex.text({ lines: [{ text: item.text, px: 96, weight: 500, spacing: 2 }], color: '#232326', padding: 12 });
    holder.add(createTextPlane(text, Infinity, item.height));
    const thread = new Line(
      new BufferGeometry().setFromPoints([new Vector3(0, item.height / 2, 0), new Vector3(0, room.height - item.center[1], 0)]),
      mats.thread,
    );
    holder.add(thread);
    group.add(holder);
    return holder;
  });
  return {
    group,
    update: (t) => holders.forEach((h, i) => { h.rotation.y = 0.1 * Math.sin(0.5 * t + i * 1.7); }),
  };
}
```

`src/museum/scenes/network.ts`:
```ts
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, MeshBasicMaterial, type Texture } from 'three';
import type { SceneContext, SceneObject } from '../context';

/** Same image data as `src`, cropped to a centred square through the UV transform. */
function squareCrop(src: Texture, aspect: number): Texture {
  const t = src.clone();
  if (aspect > 1) {
    t.repeat.set(1 / aspect, 1);
    t.offset.set((1 - 1 / aspect) / 2, 0);
  } else {
    t.repeat.set(1, aspect);
    t.offset.set(0, (1 - aspect) / 2);
  }
  t.needsUpdate = true;
  return t;
}

export function buildNetwork({ layout, span, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  const net = layout.network;
  if (!net) return { group };
  group.name = 'network';
  group.position.set(...net.center);
  const geometry = new BoxGeometry(net.nodeSize, net.nodeSize, net.nodeSize);
  const cubes = net.nodes.map((p, i) => {
    const photo = content.photos[i];
    const material = new MeshBasicMaterial({ map: squareCrop(photo.texture, photo.aspect) });
    material.userData.ownsMap = true;
    const cube = new Mesh(geometry, material);
    cube.position.set(...p);
    group.add(cube);
    return cube;
  });
  const positions = net.edges.flatMap(([a, b]) => [...net.nodes[a], ...net.nodes[b]]);
  const lines = new BufferGeometry();
  lines.setAttribute('position', new Float32BufferAttribute(positions, 3));
  group.add(new LineSegments(lines, mats.edge));
  return {
    group,
    update: (t) => {
      const local = t - span.start;
      group.rotation.y = local * 0.22;
      cubes.forEach((c, i) => {
        c.rotation.x = local * 0.3 + i;
        c.rotation.y = local * 0.2 + i * 0.5;
      });
    },
  };
}
```

`src/museum/scenes/finale.ts`:
```ts
import { Group } from 'three';
import type { SceneContext, SceneObject } from '../context';
import { createFramedPhoto, createGlow } from '../frame';
import { createVisitor } from '../visitor';

export function buildFinale({ layout, content, mats }: SceneContext): SceneObject {
  const group = new Group();
  const slot = layout.finalePortrait;
  group.add(createFramedPhoto(slot, content.photos[slot.photoIndex], mats));
  const [x, y, z] = slot.center;
  group.add(createGlow(mats, [x, y + slot.height * 0.2, z], slot.normal, slot.width * 1.8, slot.height * 1.6));
  const visitor = createVisitor(mats.visitor);
  visitor.position.set(...layout.visitor);
  visitor.rotation.y = Math.PI;
  group.add(visitor);
  return { group };
}
```

- [ ] **Step 5: 組裝 `src/museum/build.ts`**

```ts
import { Color, DirectionalLight, HemisphereLight, Line, Mesh, Scene, type Material, type MeshBasicMaterial } from 'three';
import type { TextureFactory } from '../assets/texture-factory';
import type { SceneId, Timeline } from '../types';
import { buildRoomShell } from './architecture';
import type { MuseumContent, SceneContext, SceneObject } from './context';
import type { Layout } from './layout';
import { createMaterials } from './materials';
import { buildCorridor } from './scenes/corridor';
import { buildFinale } from './scenes/finale';
import { buildGallery } from './scenes/gallery';
import { buildHall } from './scenes/hall';
import { buildKeywords } from './scenes/keywords';
import { buildNetwork } from './scenes/network';
import { buildOpening } from './scenes/opening';

export type { MuseumContent } from './context';

export interface MuseumScene {
  scene: Scene;
  update(t: number): void;
  dispose(): void;
}

const BUILDERS: Record<SceneId, (ctx: SceneContext) => SceneObject> = {
  opening: buildOpening,
  hall: buildHall,
  corridor: buildCorridor,
  gallery: buildGallery,
  keywords: buildKeywords,
  network: buildNetwork,
  finale: buildFinale,
};

export function buildMuseum(timeline: Timeline, layout: Layout, content: MuseumContent, tex: TextureFactory): MuseumScene {
  if (content.photos.length !== layout.corridorSlots.length) throw new Error('museum content does not match the layout');
  if (timeline.scenes.length !== layout.rooms.length) throw new Error('layout does not match the timeline');

  const scene = new Scene();
  scene.background = new Color(0xffffff);
  scene.add(new HemisphereLight(0xffffff, 0xe8e4dc, 1.1));
  const sun = new DirectionalLight(0xffffff, 0.8);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const mats = createMaterials(tex.glow());
  const updaters: ((t: number) => void)[] = [];
  layout.rooms.forEach((room, i) => {
    scene.add(buildRoomShell(room, mats));
    const built = BUILDERS[room.id]({ room, span: timeline.scenes[i], layout, content, tex, mats });
    scene.add(built.group);
    if (built.update) updaters.push(built.update);
  });

  return {
    scene,
    update(t) {
      for (const u of updaters) u(t);
    },
    dispose() {
      scene.traverse((obj) => {
        if (!(obj instanceof Mesh || obj instanceof Line)) return;
        obj.geometry.dispose();
        const material = obj.material as Material;
        if (material.userData.ownsMap) {
          (material as MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
      });
      mats.dispose();
    },
  };
}
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npx vitest run tests/unit/museum.test.ts`
Expected: PASS（6 passed）

- [ ] **Step 7: 全部單元測試與型別檢查**

Run: `npm test && npm run typecheck`
Expected: 所有單元測試 PASS，型別檢查無錯誤

- [ ] **Step 8: 提交**

```bash
git add src/museum tests/unit/museum.test.ts
git commit -m "feat: build the museum scene (rooms, frames, plaques, keywords, network, visitor)"
```

---
### Task 9: 設定表單 `ui/`

**Files:**
- Create: `src/ui/validate.ts`, `src/ui/setup-form.ts`, `src/ui/styles.css`, `tests/e2e/setup-form.spec.ts`
- Modify: `src/main.ts`（整檔取代）
- Test: `tests/unit/validate.test.ts`

**Interfaces:**
- Consumes: `ProjectInput`, `Resolution`, `DurationMode`（Task 1）；`index.html` 內的元素 id（Task 1）
- Produces: `MIN_PHOTOS`, `MAX_PHOTOS`, `MAX_KEYWORDS`；`parseKeywords(raw): string[]`；`capPhotos<T>(files: T[], room: number): { kept: T[]; dropped: number }`；`validateSetup({ photoCount, name }): string[]`；`parseDuration(v: string): DurationMode`；`isImageFile({ type, name }): boolean`；`mountSetupForm(root: HTMLElement, onSubmit: (input: ProjectInput) => void): void`；CSS class `photo-item`、`move-up`、`move-down`、`remove`、`idx`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/validate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { capPhotos, isImageFile, parseDuration, parseKeywords, validateSetup } from '../../src/ui/validate';

describe('parseKeywords', () => {
  it('splits on half- and full-width separators, trims and removes duplicates', () => {
    expect(parseKeywords('勇氣，旅行、 family ,勇氣\n2026;;')).toEqual(['勇氣', '旅行', 'family', '2026']);
  });

  it('caps the list at 40 keywords', () => {
    expect(parseKeywords(Array.from({ length: 50 }, (_, i) => `k${i}`).join(','))).toHaveLength(40);
  });

  it('returns an empty list for blank input', () => {
    expect(parseKeywords('  \n , ')).toEqual([]);
  });
});

describe('capPhotos', () => {
  it('keeps as many files as there is room for and counts the rest', () => {
    expect(capPhotos([1, 2, 3, 4], 3)).toEqual({ kept: [1, 2, 3], dropped: 1 });
    expect(capPhotos([1, 2], 5)).toEqual({ kept: [1, 2], dropped: 0 });
    expect(capPhotos([1, 2], -1)).toEqual({ kept: [], dropped: 2 });
  });
});

describe('validateSetup', () => {
  it('requires 3 photos and a non-blank name', () => {
    expect(validateSetup({ photoCount: 2, name: ' ' })).toEqual(['請至少選擇 3 張照片（目前 2 張）', '請輸入主角名字']);
    expect(validateSetup({ photoCount: 3, name: '小明' })).toEqual([]);
  });
});

describe('parseDuration', () => {
  it('maps select values to duration modes', () => {
    expect(parseDuration('auto')).toBe('auto');
    expect(parseDuration('90')).toBe(90);
    expect(() => parseDuration('45')).toThrow();
  });
});

describe('isImageFile', () => {
  it('accepts image MIME types and known image extensions', () => {
    expect(isImageFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isImageFile({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
    expect(isImageFile({ type: 'text/plain', name: 'notes.txt' })).toBe(false);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `src/ui/validate.ts`**

```ts
import type { DurationMode } from '../types';

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 60;
export const MAX_KEYWORDS = 40;

export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,，、;；\n\r]+/)) {
    const word = part.trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length === MAX_KEYWORDS) break;
  }
  return out;
}

export function capPhotos<T>(files: T[], room: number): { kept: T[]; dropped: number } {
  const n = Math.max(0, room);
  return { kept: files.slice(0, n), dropped: Math.max(0, files.length - n) };
}

export function validateSetup(state: { photoCount: number; name: string }): string[] {
  const problems: string[] = [];
  if (state.photoCount < MIN_PHOTOS) problems.push(`請至少選擇 ${MIN_PHOTOS} 張照片（目前 ${state.photoCount} 張）`);
  if (!state.name.trim()) problems.push('請輸入主角名字');
  return problems;
}

export function parseDuration(value: string): DurationMode {
  if (value === 'auto') return 'auto';
  const n = Number(value);
  if (n === 30 || n === 60 || n === 90 || n === 120) return n;
  throw new Error(`unknown duration option: ${value}`);
}

export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: PASS（7 passed）

- [ ] **Step 5: 表單行為 `src/ui/setup-form.ts`**

```ts
import type { ProjectInput, Resolution } from '../types';
import { MAX_PHOTOS, capPhotos, isImageFile, parseDuration, parseKeywords, validateSetup } from './validate';

interface PhotoEntry {
  id: number;
  file: File;
  url: string;
  caption: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function mountSetupForm(root: HTMLElement, onSubmit: (input: ProjectInput) => void): void {
  const q = <T extends Element>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`${selector} is missing from the setup form`);
    return node;
  };
  const form = q<HTMLFormElement>('#setup-form');
  const photoInput = q<HTMLInputElement>('#photo-input');
  const dropzone = q<HTMLElement>('#dropzone');
  const list = q<HTMLOListElement>('#photo-list');
  const notice = q<HTMLElement>('#setup-notice');
  const errors = q<HTMLElement>('#setup-errors');
  const generate = q<HTMLButtonElement>('#generate');
  const name = q<HTMLInputElement>('#name');
  const subtitle = q<HTMLInputElement>('#subtitle');
  const date = q<HTMLInputElement>('#date');
  const keywords = q<HTMLTextAreaElement>('#keywords');
  const duration = q<HTMLSelectElement>('#duration');
  const resolution = q<HTMLSelectElement>('#resolution');
  const music = q<HTMLInputElement>('#music');

  let entries: PhotoEntry[] = [];
  let portraitId: number | null = null;
  let nextId = 1;
  let dragId: number | null = null;
  let touched = false;

  function refresh(): void {
    const problems = validateSetup({ photoCount: entries.length, name: name.value });
    generate.disabled = problems.length > 0;
    errors.textContent = touched ? problems.join('；') : '';
  }

  function render(): void {
    list.replaceChildren(...entries.map(renderItem));
    refresh();
  }

  function move(from: number, to: number): void {
    if (from < 0 || to < 0 || to >= entries.length || from === to) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    render();
  }

  function remove(id: number): void {
    const entry = entries.find((e) => e.id === id);
    if (entry) URL.revokeObjectURL(entry.url);
    entries = entries.filter((e) => e.id !== id);
    if (portraitId === id) portraitId = entries[0]?.id ?? null;
    render();
  }

  function addFiles(files: File[]): void {
    touched = true;
    const images = files.filter(isImageFile);
    const { kept, dropped } = capPhotos(images, MAX_PHOTOS - entries.length);
    for (const file of kept) entries.push({ id: nextId++, file, url: URL.createObjectURL(file), caption: '' });
    if (portraitId === null && entries.length > 0) portraitId = entries[0].id;
    const messages: string[] = [];
    if (dropped > 0) messages.push(`最多 ${MAX_PHOTOS} 張照片，已略過 ${dropped} 張`);
    if (files.length > images.length) messages.push(`已略過 ${files.length - images.length} 個非圖片檔`);
    notice.textContent = messages.join('；');
    render();
  }

  function renderItem(entry: PhotoEntry, index: number): HTMLLIElement {
    const caption = el('input', { className: 'caption', type: 'text', placeholder: '說明文字（選填）', maxLength: 80, value: entry.caption });
    caption.addEventListener('input', () => { entry.caption = caption.value; });
    const radio = el('input', { type: 'radio', name: 'portrait', checked: entry.id === portraitId });
    radio.addEventListener('change', () => { portraitId = entry.id; });
    const up = el('button', { type: 'button', className: 'move-up', textContent: '↑', title: '往前移', disabled: index === 0 });
    up.addEventListener('click', () => move(index, index - 1));
    const down = el('button', { type: 'button', className: 'move-down', textContent: '↓', title: '往後移', disabled: index === entries.length - 1 });
    down.addEventListener('click', () => move(index, index + 1));
    const del = el('button', { type: 'button', className: 'remove', textContent: '✕', title: '移除' });
    del.addEventListener('click', () => remove(entry.id));

    const li = el(
      'li',
      { className: 'photo-item', draggable: true },
      el('img', { src: entry.url, alt: '' }),
      el('span', { className: 'idx' }, `No. ${String(index + 1).padStart(2, '0')}`),
      caption,
      el('label', { className: 'portrait' }, radio, ' 主視覺'),
      el('span', { className: 'tools' }, up, down, del),
    );
    li.addEventListener('dragstart', () => { dragId = entry.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); });
    li.addEventListener('dragover', (ev) => { if (dragId !== null) ev.preventDefault(); });
    li.addEventListener('drop', (ev) => {
      if (dragId === null) return;
      ev.preventDefault();
      move(entries.findIndex((e) => e.id === dragId), index);
    });
    return li;
  }

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

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    touched = true;
    refresh();
    if (generate.disabled) return;
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
      music: music.files?.[0] ?? null,
    });
  });

  refresh();
}
```

- [ ] **Step 6: 樣式 `src/ui/styles.css`**

```css
:root {
  --bg: #f6f5f2;
  --paper: #ffffff;
  --ink: #1d1d1f;
  --muted: #6e6e73;
  --line: #dcdad5;
  --danger: #b3261e;
  font-family: "Noto Sans TC", "Noto Sans JP", system-ui, sans-serif;
  color: var(--ink);
  background: var(--bg);
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; min-height: 100vh; background: var(--bg); }

.masthead { max-width: 960px; margin: 0 auto; padding: 56px 20px 24px; }
.eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 8px 0 12px; font-weight: 300; font-size: clamp(32px, 6vw, 56px); letter-spacing: 0.08em; }
.lede { margin: 0; color: var(--muted); }
main { max-width: 960px; margin: 0 auto; padding: 0 20px 64px; }

.block { border: 1px solid var(--line); background: var(--paper); padding: 20px; margin: 0 0 16px; }
legend { padding: 0 8px; font-weight: 500; letter-spacing: 0.1em; }
.field { display: grid; gap: 6px; margin: 0 0 14px; }
.field > span, .field small { font-size: 14px; color: var(--muted); }
input:not([type="file"]):not([type="radio"]):not([type="range"]), select, textarea {
  font: inherit; padding: 8px 10px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); border-radius: 0;
}
button { font: inherit; padding: 8px 16px; border: 1px solid var(--ink); background: var(--paper); color: var(--ink); cursor: pointer; }
button.primary { background: var(--ink); color: var(--paper); }
button:disabled { opacity: 0.35; cursor: not-allowed; }
button.icon { padding: 4px 10px; min-width: 44px; }

.dropzone { display: grid; gap: 6px; place-items: center; text-align: center; padding: 28px 16px; border: 1px dashed var(--line); cursor: pointer; color: var(--muted); }
.dropzone strong { color: var(--ink); font-weight: 500; }
.dropzone.over { border-color: var(--ink); background: #fafaf8; }

.photo-list { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
.photo-item { display: grid; grid-template-columns: 64px 56px 1fr auto auto; gap: 12px; align-items: center; padding: 8px; border: 1px solid var(--line); background: var(--paper); cursor: grab; }
.photo-item.dragging { opacity: 0.4; }
.photo-item img { width: 64px; height: 48px; object-fit: cover; display: block; }
.photo-item .idx { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.photo-item .caption { width: 100%; min-width: 0; }
.photo-item .portrait { font-size: 14px; white-space: nowrap; }
.photo-item .tools { display: flex; gap: 4px; }
.photo-item .tools button { padding: 4px 8px; }

.notice { color: var(--muted); font-size: 14px; white-space: pre-line; min-height: 1em; }
.errors { color: var(--danger); font-size: 14px; min-height: 1em; }

.viewport { background: #fff; border: 1px solid var(--line); aspect-ratio: 16 / 9; }
.viewport canvas { width: 100%; height: 100%; display: block; }
.controls { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; margin: 12px 0; }
.controls input[type="range"] { width: 100%; }
.time { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 14px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
.export-panel { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; margin-top: 12px; }
.export-panel progress { width: 100%; height: 6px; }

.busy { position: fixed; inset: 0; display: grid; place-items: center; background: rgb(246 245 242 / 0.85); }
.busy-card { text-align: center; color: var(--muted); }
.spinner { width: 28px; height: 28px; margin: 0 auto 12px; border: 2px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .photo-item { grid-template-columns: 56px 1fr; }
  .photo-item .idx { display: none; }
  .export-panel { grid-template-columns: 1fr; }
}
```

- [ ] **Step 7: 暫時的 `src/main.ts`（Task 10 取代）**

```ts
import './ui/styles.css';
import { mountSetupForm } from './ui/setup-form';

const setup = document.getElementById('setup');
if (!setup) throw new Error('#setup is missing from index.html');
mountSetupForm(setup, (input) => {
  console.info('setup', JSON.stringify({ ...input, photos: input.photos.map((f) => f.name), music: input.music?.name ?? null }));
});
```

- [ ] **Step 8: 寫表單 e2e `tests/e2e/setup-form.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { fixture, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;

const srcs = (page: import('@playwright/test').Page) =>
  page.locator('.photo-item img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));

test('generate stays disabled until 3 photos and a name are provided', async ({ page }) => {
  await page.goto('/');
  const generate = page.locator('#generate');
  await page.setInputFiles('#photo-input', [fixture('photo-1.jpg'), fixture('photo-2.jpg')]);
  await expect(page.locator('.photo-item')).toHaveCount(2);
  await expect(generate).toBeDisabled();
  await expect(page.locator('#setup-errors')).toContainText('請至少選擇 3 張照片');
  await page.setInputFiles('#photo-input', [fixture('photo-3.jpg')]);
  await expect(page.locator('.photo-item')).toHaveCount(3);
  await expect(generate).toBeDisabled();
  await page.fill('#name', '小明');
  await expect(generate).toBeEnabled();
});

test('photos can be reordered and removed; the first photo is the default portrait', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  const items = page.locator('.photo-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('input[type=radio]')).toBeChecked();
  const before = await srcs(page);
  await items.nth(0).locator('.move-down').click();
  expect(await srcs(page)).toEqual([before[1], before[0], before[2]]);
  await expect(items.nth(1).locator('input[type=radio]')).toBeChecked();
  await expect(items.nth(0).locator('.idx')).toHaveText('No. 01');
  await items.nth(2).locator('.remove').click();
  await expect(items).toHaveCount(2);
});

test('submitting hands the parsed form values to the callback', async ({ page }) => {
  await page.goto('/');
  // Re-mount the form on a listener-free copy of #setup so the test owns the submit callback
  // (main.ts changes in later tasks and must not affect this test).
  await page.evaluate(() => {
    const old = document.getElementById('setup')!;
    old.replaceWith(old.cloneNode(true));
  });
  await loadModule(page, '/src/ui/setup-form.ts', '__form');
  await page.evaluate(() => {
    const w = window as AnyWindow;
    w.__form.mountSetupForm(document.getElementById('setup'), (input: any) => {
      w.__submitted = { ...input, photos: input.photos.map((f: File) => f.name), music: input.music?.name ?? null };
    });
  });
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  await page.locator('.photo-item').nth(2).locator('input[type=radio]').check();
  await page.locator('.photo-item').nth(0).locator('.caption').fill('第一天');
  await page.fill('#name', ' 小明 ');
  await page.fill('#keywords', '勇氣，旅行\n勇氣');
  await page.selectOption('#duration', '60');
  await page.selectOption('#resolution', '720p');
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
    music: null,
  });
});
```

Run: `npx playwright test tests/e2e/setup-form.spec.ts`
Expected: PASS（3 passed）

- [ ] **Step 9: 提交**

```bash
git add src/ui src/main.ts tests/unit/validate.test.ts tests/e2e/setup-form.spec.ts
git commit -m "feat: add setup form with validation, reordering, portrait choice and styles"
```

---

### Task 10: 渲染器、預覽播放器與專案組裝

**Files:**
- Create: `src/typings/n8ao.d.ts`, `src/render/renderer.ts`, `src/preview/player.ts`, `src/app/project.ts`, `tests/e2e/preview.spec.ts`
- Modify: `src/main.ts`（整檔取代）

**Interfaces:**
- Consumes: 前面所有 Task 的輸出：`buildTimeline`、`computeLayout`、`buildMuseum`/`MuseumScene`、`buildCameraKeys`、`createCameraPath`/`CameraPath`、`fadesAt`、`FinishEffect`、`buildSoundtrack`、`loadPhotos`、`createCanvasTextureFactory`、`ensureFonts`、`mountSetupForm`、`MIN_PHOTOS`、`formatDisplayDate`、`formatTime`、`hashString`、`FPS`
- Produces:
  - `interface MuseumRenderer { readonly canvas: HTMLCanvasElement; readonly width: number; readonly height: number; setSize(w: number, h: number): void; renderFrame(t: number): void; dispose(): void }`；`createRenderer(o: { canvas; museum: MuseumScene; camera: CameraPath; total: number; endCard: Texture }): MuseumRenderer`
  - `interface Player { play(): void; pause(): void; toggle(): void; seek(t: number): void; readonly time: number; readonly playing: boolean; dispose(): void }`；`createPlayer(o: { render: (t: number) => void; audio: AudioBuffer; total: number; onTick: (t: number, playing: boolean) => void }): Player`
  - `interface Project { input: ProjectInput; timeline: Timeline; layout: Layout; museum: MuseumScene; camera: CameraPath; soundtrack: AudioBuffer; endCard: Texture; warnings: string[]; dispose(): void }`；`buildProject(input, onStatus: (message: string) => void): Promise<Project>`

- [ ] **Step 1: 寫失敗的 e2e `tests/e2e/preview.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { fillSetup } from './helpers';

/** Max − min luminance and the median luminance of the preview, sampled at 64×36. */
async function frameStats(page: Page, t: number): Promise<{ contrast: number; median: number }> {
  await page.locator('#scrub').fill(String(t));
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
    const off = document.createElement('canvas');
    off.width = 64;
    off.height = 36;
    const g = off.getContext('2d')!;
    g.drawImage(canvas, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) lum.push((d[i] + d[i + 1] + d[i + 2]) / 3);
    lum.sort((a, b) => a - b);
    return { contrast: lum[lum.length - 1] - lum[0], median: lum[Math.floor(lum.length / 2)] };
  });
}

test('generating a museum shows a live, bright, non-blank preview', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fillSetup(page, { name: '小明', duration: 'auto', resolution: '720p' });

  // 5 photos, auto, with keywords: 6 + 8 + 8 + 15 + 8 + 8 + 8
  expect(Number(await page.locator('#scrub').getAttribute('max'))).toBe(61);
  await expect(page.locator('#time')).toHaveText('0:00 / 1:01');
  expect((await frameStats(page, 0)).contrast).toBeLessThan(10);

  for (const t of [8, 14, 24, 40, 48, 56]) {
    const stats = await frameStats(page, t);
    expect(stats.contrast, `contrast at ${t}s`).toBeGreaterThan(40);
    expect(stats.median, `median luminance at ${t}s`).toBeGreaterThan(150);
    expect(stats.median, `median luminance at ${t}s`).toBeLessThan(250);
    await page.locator('#viewport canvas').screenshot({ path: test.info().outputPath(`preview-${t}s.png`) });
  }
  expect((await frameStats(page, 61)).median).toBeGreaterThan(200);
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
  await expect(page.locator('.photo-item')).toHaveCount(5);
});
```

Run: `npx playwright test tests/e2e/preview.spec.ts`
Expected: FAIL（`#stage` 不會出現：Task 9 的 main.ts 只記錄 console）

- [ ] **Step 2: n8ao 型別 `src/typings/n8ao.d.ts`**

```ts
declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
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

- [ ] **Step 3: 渲染器 `src/render/renderer.ts`**

```ts
import { N8AOPostPass } from 'n8ao';
import { EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { HalfFloatType, NoToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, WebGLRenderer, type Texture } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CameraPath } from '../camera/hermite';
import type { MuseumScene } from '../museum/build';
import { FPS } from '../types';
import { fadesAt } from './fades';
import { FinishEffect } from './finish-effect';

export interface MuseumRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  /** The only drawing entry point: preview and export both call this. */
  renderFrame(t: number): void;
  dispose(): void;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  museum: MuseumScene;
  camera: CameraPath;
  total: number;
  endCard: Texture;
}

export function createRenderer(o: RendererOptions): MuseumRenderer {
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
  o.museum.scene.environment = environment;
  o.museum.scene.environmentIntensity = 0.85;

  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 400);
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(o.museum.scene, camera));
  const ao = new N8AOPostPass(o.museum.scene, camera, 1280, 720);
  ao.configuration.aoRadius = 1.2;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.4;
  ao.setQualityMode('High');
  composer.addPass(ao);
  const finish = new FinishEffect(o.endCard);
  composer.addPass(
    new EffectPass(
      camera,
      new SMAAEffect({ preset: SMAAPreset.HIGH }),
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.35, darkness: 0.4 }),
      finish,
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
    o.museum.update(t);
    const pose = o.camera.poseAt(t);
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    const fades = fadesAt(t, o.total);
    finish.setState(fades.white, fades.card, Math.round(t * FPS));
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

- [ ] **Step 4: 預覽播放器 `src/preview/player.ts`**

```ts
import { clamp } from '../util/math';

export interface Player {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  readonly time: number;
  readonly playing: boolean;
  dispose(): void;
}

export interface PlayerOptions {
  render: (t: number) => void;
  audio: AudioBuffer;
  total: number;
  onTick: (t: number, playing: boolean) => void;
}

/** Plays the soundtrack through an AudioContext and renders frames on its clock. */
export function createPlayer(o: PlayerOptions): Player {
  const ctx = new AudioContext({ sampleRate: o.audio.sampleRate });
  let source: AudioBufferSourceNode | null = null;
  let offset = 0;
  let startedAt = 0;
  let playing = false;
  let raf = 0;

  const now = (): number => (playing ? Math.min(o.total, ctx.currentTime - startedAt) : offset);

  function stopSource(): void {
    if (!source) return;
    source.stop();
    source.disconnect();
    source = null;
  }

  function frame(): void {
    const t = now();
    o.render(t);
    if (playing && t >= o.total) {
      pause();
      return;
    }
    o.onTick(t, playing);
    if (playing) raf = requestAnimationFrame(frame);
  }

  function play(): void {
    if (playing) return;
    if (offset >= o.total - 0.05) offset = 0;
    void ctx.resume();
    source = ctx.createBufferSource();
    source.buffer = o.audio;
    source.connect(ctx.destination);
    source.start(0, offset);
    startedAt = ctx.currentTime - offset;
    playing = true;
    raf = requestAnimationFrame(frame);
  }

  function pause(): void {
    if (!playing) return;
    offset = now();
    playing = false;
    cancelAnimationFrame(raf);
    stopSource();
    o.onTick(offset, false);
  }

  function seek(t: number): void {
    const resume = playing;
    if (resume) pause();
    offset = clamp(t, 0, o.total);
    o.render(offset);
    o.onTick(offset, false);
    if (resume) play();
  }

  return {
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    seek,
    get time() { return now(); },
    get playing() { return playing; },
    dispose() {
      pause();
      void ctx.close();
    },
  };
}
```

- [ ] **Step 5: 專案組裝 `src/app/project.ts`**

```ts
import type { Texture } from 'three';
import { loadPhotos } from '../assets/photos';
import { createCanvasTextureFactory, ensureFonts } from '../assets/text';
import { buildSoundtrack } from '../audio/soundtrack';
import { createCameraPath, type CameraPath } from '../camera/hermite';
import { buildCameraKeys } from '../camera/keys';
import { buildMuseum, type MuseumScene } from '../museum/build';
import { computeLayout, type Layout } from '../museum/layout';
import { buildTimeline } from '../plan/timeline';
import type { ProjectInput, Timeline } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { formatDisplayDate } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  timeline: Timeline;
  layout: Layout;
  museum: MuseumScene;
  camera: CameraPath;
  soundtrack: AudioBuffer;
  endCard: Texture;
  warnings: string[];
  dispose(): void;
}

export async function buildProject(input: ProjectInput, onStatus: (message: string) => void): Promise<Project> {
  onStatus('載入字型…');
  await ensureFonts(['THE MUSEUM OF No.0123456789–', input.name, input.subtitle, input.date, ...input.keywords, ...input.captions]);

  onStatus(`處理照片（${input.photos.length} 張）…`);
  const { photos, failed } = await loadPhotos(input.photos);
  const warnings: string[] = [];
  if (failed.length > 0) warnings.push(`無法讀取 ${failed.length} 張照片，已略過：${failed.join('、')}`);
  if (photos.length < MIN_PHOTOS) {
    photos.forEach((p) => p.texture.dispose());
    const detail = failed.length > 0 ? `（無法讀取：${failed.join('、')}）` : '';
    throw new Error(`可用的照片不足 ${MIN_PHOTOS} 張${detail}`);
  }
  const captions = photos.map((p) => input.captions[p.sourceIndex] ?? '');
  const portraitIndex = Math.max(0, photos.findIndex((p) => p.sourceIndex === input.portraitIndex));
  const seed = hashString([input.name, ...input.keywords, String(photos.length)].join('|'));

  onStatus('布置展廳…');
  const timeline = buildTimeline({ photoCount: photos.length, durationMode: input.durationMode, hasKeywords: input.keywords.length > 0 });
  const layout = computeLayout({ timeline, aspects: photos.map((p) => p.aspect), portraitIndex, keywords: input.keywords, seed });
  const tex = createCanvasTextureFactory();
  const date = formatDisplayDate(input.date);
  const museum = buildMuseum(timeline, layout, {
    photos, captions, portraitIndex, name: input.name, subtitle: input.subtitle, date, keywords: input.keywords,
  }, tex);
  const camera = createCameraPath(buildCameraKeys(timeline, layout));
  const endCard = tex.text({
    size: { width: 1920, height: 1080 },
    lines: [
      { text: 'THE MUSEUM OF', px: 44, weight: 300, spacing: 14 },
      { text: input.name, px: 120, weight: 700, spacing: 4 },
      { text: input.subtitle, px: 40, weight: 300, spacing: 4 },
      { text: date, px: 32, weight: 300, spacing: 6, color: '#6e6e73' },
    ],
  }).texture;

  onStatus('合成配樂…');
  const soundtrack = await buildSoundtrack(input.music, timeline.total, seed);
  if (soundtrack.warning) warnings.push(soundtrack.warning);

  return {
    input, timeline, layout, museum, camera, soundtrack: soundtrack.buffer, endCard, warnings,
    dispose() {
      museum.dispose();
      photos.forEach((p) => p.texture.dispose());
      endCard.dispose();
    },
  };
}
```

- [ ] **Step 6: `src/main.ts`（整檔取代；Task 11 會再加上匯出）**

```ts
import './ui/styles.css';
import { buildProject, type Project } from './app/project';
import { createPlayer, type Player } from './preview/player';
import { createRenderer, type MuseumRenderer } from './render/renderer';
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
const stageStatus = byId('stage-status');
const busy = byId('busy');
const busyLabel = byId('busy-label');
const setupErrors = byId('setup-errors');

interface Session {
  project: Project;
  canvas: HTMLCanvasElement;
  renderer: MuseumRenderer;
  player: Player;
}

let session: Session | null = null;

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
  const total = project.timeline.total;
  const renderer = createRenderer({ canvas, museum: project.museum, camera: project.camera, total, endCard: project.endCard });
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

mountSetupForm(setup, async (input) => {
  showBusy('正在布置展廳…');
  setupErrors.textContent = '';
  try {
    openStage(await buildProject(input, showBusy));
  } catch (err) {
    closeStage();
    setupErrors.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    busy.hidden = true;
  }
});

playButton.addEventListener('click', () => session?.player.toggle());
scrub.addEventListener('input', () => session?.player.seek(Number(scrub.value)));
backButton.addEventListener('click', closeStage);
window.addEventListener('resize', () => {
  if (!session) return;
  fitPreview(session);
  session.player.seek(session.player.time);
});
```

- [ ] **Step 7: 執行 e2e 確認通過**

Run: `npx playwright test tests/e2e/preview.spec.ts`
Expected: PASS（3 passed）。若亮度（median）門檻失敗：只調整 `src/museum/materials.ts` 的顏色、`src/museum/build.ts` 的燈光強度、`src/render/renderer.ts` 的 `environmentIntensity` 與 AO `intensity`，不得改動門檻。

- [ ] **Step 8: 目視檢查**

打開 `test-results/` 下 `preview-8s.png`（大廳肖像）、`preview-24s.png`（主展廳）、`preview-40s.png`（關鍵字廳）、`preview-48s.png`（網絡裝置）、`preview-56s.png`（終章剪影）。檢查項目：牆面為乾淨的白（不偏灰、不過曝）、牆角有柔和陰影、畫框不歪斜、照片沒有左右鏡像、文字沒有鏡像。發現問題就修改對應的場景檔並重跑 Step 7。

- [ ] **Step 9: 全部測試並提交**

Run: `npm test && npm run typecheck && npx playwright test`
Expected: 全部 PASS

```bash
git add src tests/e2e/preview.spec.ts
git commit -m "feat: add postprocessing renderer, audio-clocked preview player and project assembly"
```

---

### Task 11: 影片匯出 `export/`

**Files:**
- Create: `src/export/filename.ts`, `src/export/exporter.ts`, `tests/e2e/export.spec.ts`
- Modify: `src/main.ts`（整檔取代，加入匯出）
- Test: `tests/unit/filename.test.ts`

**Interfaces:**
- Consumes: `MuseumRenderer`（Task 10）、`RESOLUTIONS`、`FPS`（Task 1）、`formatTime`
- Produces: `exportFilename(name: string, date: Date, extension: string): string`；`AUDIO_BITRATE = 192_000`；`class ExportUnsupportedError extends Error`；`interface ExportFormat { container: 'mp4' | 'webm'; video: VideoCodec; audio: AudioCodec }`；`pickFormat(width, height, bitrate, audio: { sampleRate: number; numberOfChannels: number }): Promise<ExportFormat | null>`；`interface ExportProgress { frame: number; frames: number; etaSeconds: number | null }`；`exportVideo(o: ExportOptions): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }>`；`sliceAudioBuffer(src, start, end): AudioBuffer`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/filename.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { exportFilename } from '../../src/export/filename';

describe('exportFilename', () => {
  it('keeps CJK names and appends the date as yyyymmdd', () => {
    expect(exportFilename('小明', new Date(2026, 8, 28), 'mp4')).toBe('museum-of-小明-20260928.mp4');
  });

  it('turns whitespace into dashes and strips characters that are illegal in file names', () => {
    expect(exportFilename('  Amy / Lee: "2026" ', new Date(2026, 0, 5), 'webm')).toBe('museum-of-Amy-Lee-2026-20260105.webm');
  });

  it('falls back to "me" when nothing usable is left', () => {
    expect(exportFilename(' /// ', new Date(2026, 0, 5), 'mp4')).toBe('museum-of-me-20260105.mp4');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/unit/filename.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作 `src/export/filename.ts`**

```ts
export function exportFilename(name: string, date: Date, extension: string): string {
  const slug = name.trim().replace(/[\\/:*?"<>|%]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'me';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `museum-of-${slug}-${y}${m}${d}.${extension}`;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/filename.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 實作 `src/export/exporter.ts`**

```ts
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat,
  canEncodeAudio, canEncodeVideo, getFirstEncodableVideoCodec, type AudioCodec, type VideoCodec,
} from 'mediabunny';

export const AUDIO_BITRATE = 192_000;

export class ExportUnsupportedError extends Error {
  constructor() {
    super('此瀏覽器無法編碼影片，請改用最新版 Chrome 或 Edge');
    this.name = 'ExportUnsupportedError';
  }
}

export interface ExportFormat {
  container: 'mp4' | 'webm';
  video: VideoCodec;
  audio: AudioCodec;
}

export interface ExportProgress {
  frame: number;
  frames: number;
  etaSeconds: number | null;
}

export interface ExportOptions {
  canvas: HTMLCanvasElement;
  renderFrame: (t: number) => void;
  total: number;
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  audio: AudioBuffer;
  signal: AbortSignal;
  onProgress: (p: ExportProgress) => void;
}

let aacRegistered = false;

export async function pickFormat(
  width: number,
  height: number,
  bitrate: number,
  audio: { sampleRate: number; numberOfChannels: number },
): Promise<ExportFormat | null> {
  const audioOptions = { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, bitrate: AUDIO_BITRATE };
  if (await canEncodeVideo('avc', { width, height, bitrate })) {
    if (!aacRegistered && !(await canEncodeAudio('aac', audioOptions))) {
      registerAacEncoder();
      aacRegistered = true;
    }
    return { container: 'mp4', video: 'avc', audio: 'aac' };
  }
  const video = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height, bitrate });
  if (video && (await canEncodeAudio('opus', audioOptions))) return { container: 'webm', video, audio: 'opus' };
  return null;
}

export function sliceAudioBuffer(src: AudioBuffer, start: number, end: number): AudioBuffer {
  const out = new AudioBuffer({ length: end - start, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let c = 0; c < src.numberOfChannels; c++) out.copyToChannel(src.getChannelData(c).subarray(start, end), c);
  return out;
}

/** Renders every frame with renderFrame(i / fps) and encodes it with the soundtrack, interleaved per second. */
export async function exportVideo(o: ExportOptions): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const format = await pickFormat(o.width, o.height, o.bitrate, o.audio);
  if (!format) throw new ExportUnsupportedError();

  const output = new Output({
    format: format.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(o.canvas, { codec: format.video, bitrate: o.bitrate, keyFrameInterval: 2, sizeChangeBehavior: 'deny' });
  const audio = new AudioBufferSource({ codec: format.audio, bitrate: AUDIO_BITRATE });
  output.addVideoTrack(video, { frameRate: o.fps });
  output.addAudioTrack(audio);
  await output.start();

  const frames = Math.round(o.total * o.fps);
  const chunk = o.audio.sampleRate;
  let audioCursor = 0;
  const addAudioUntil = async (seconds: number) => {
    while (audioCursor < o.audio.length && audioCursor / o.audio.sampleRate <= seconds) {
      const end = Math.min(o.audio.length, audioCursor + chunk);
      await audio.add(sliceAudioBuffer(o.audio, audioCursor, end));
      audioCursor = end;
    }
  };

  const started = performance.now();
  try {
    for (let i = 0; i < frames; i++) {
      o.signal.throwIfAborted();
      const t = i / o.fps;
      await addAudioUntil(t + 1);
      o.renderFrame(t);
      await video.add(t, 1 / o.fps);
      const elapsed = (performance.now() - started) / 1000;
      o.onProgress({ frame: i + 1, frames, etaSeconds: i >= 10 ? (elapsed / (i + 1)) * (frames - i - 1) : null });
      if (i % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0)); // let the UI repaint
    }
    await addAudioUntil(Infinity);
    o.signal.throwIfAborted();
    await output.finalize();
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw err;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('匯出失敗：編碼器沒有產生任何資料');
  return { blob: new Blob([buffer], { type: format.container === 'mp4' ? 'video/mp4' : 'video/webm' }), extension: format.container };
}
```

- [ ] **Step 6: `src/main.ts`（整檔取代）**

```ts
import './ui/styles.css';
import { buildProject, type Project } from './app/project';
import { exportVideo, type ExportProgress } from './export/exporter';
import { exportFilename } from './export/filename';
import { createPlayer, type Player } from './preview/player';
import { createRenderer, type MuseumRenderer } from './render/renderer';
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
const setupErrors = byId('setup-errors');

interface Session {
  project: Project;
  canvas: HTMLCanvasElement;
  renderer: MuseumRenderer;
  player: Player;
}

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
  const total = project.timeline.total;
  const renderer = createRenderer({ canvas, museum: project.museum, camera: project.camera, total, endCard: project.endCard });
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
      canvas: s.canvas, renderFrame: s.renderer.renderFrame, total: s.project.timeline.total, fps: FPS,
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

mountSetupForm(setup, async (input) => {
  showBusy('正在布置展廳…');
  setupErrors.textContent = '';
  try {
    openStage(await buildProject(input, showBusy));
  } catch (err) {
    closeStage();
    setupErrors.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    busy.hidden = true;
  }
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

- [ ] **Step 7: 寫 e2e `tests/e2e/export.spec.ts`**（涵蓋 Review Focus #5）

```ts
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fillSetup } from './helpers';

const canvasWidth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.querySelector<HTMLCanvasElement>('#viewport canvas')!.width);

test('exports a 30-second 720p MP4 with H.264 video and AAC audio', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await fillSetup(page, { name: '測試', duration: '30', resolution: '720p' });
  const downloadPromise = page.waitForEvent('download', { timeout: 29 * 60_000 });
  await page.click('#export');
  await expect(page.locator('#export-panel')).toBeVisible();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^museum-of-測試-\d{8}\.mp4$/);
  const file = test.info().outputPath('museum.mp4');
  await download.saveAs(file);

  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).toString(),
  );
  const video = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const audio = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  expect(video.codec_name).toBe('h264');
  expect(video.width).toBe(1280);
  expect(video.height).toBe(720);
  expect(Number(video.nb_read_frames)).toBe(900);
  expect(audio.codec_name).toBe('aac');
  expect(Number(audio.sample_rate)).toBe(48000);
  expect(Math.abs(Number(probe.format.duration) - 30)).toBeLessThan(0.15);
  await expect(page.locator('#export-panel')).toBeHidden();
  await expect(page.locator('#stage-status')).toHaveText('匯出完成。');
});

test('cancelling an export restores the preview and re-enables exporting', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await fillSetup(page, { name: '測試', duration: '30', resolution: '1080p' });
  const previewWidth = await canvasWidth(page);
  await page.click('#export');
  await expect
    .poll(async () => Number(await page.locator('#export-progress').getAttribute('value')), { timeout: 5 * 60_000 })
    .toBeGreaterThan(0.02);
  expect(await canvasWidth(page)).toBe(1920);
  await page.click('#cancel-export');
  await expect(page.locator('#stage-status')).toHaveText('已取消匯出');
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#export-panel')).toBeHidden();
  expect(await canvasWidth(page)).toBe(previewWidth);
});
```

- [ ] **Step 8: 執行確認通過**

Run: `npx vitest run && npx playwright test tests/e2e/export.spec.ts`
Expected: PASS（單元測試全過；e2e 2 passed）。SwiftShader 軟體渲染下 900 格可能需要數分鐘；若機器有 GPU，速度會快很多。若 `canEncodeVideo('avc')` 在 headless Chrome 為 false，第一個測試會因副檔名是 `.webm` 而失敗——此時確認 `playwright.config.ts` 用的是 `channel: 'chrome'`（系統 Chrome），而不是內建 Chromium。

- [ ] **Step 9: 提交**

```bash
git add src tests/unit/filename.test.ts tests/e2e/export.spec.ts
git commit -m "feat: export frame-accurate MP4 (H.264 + AAC) with progress, cancel and WebM fallback"
```

---

### Task 12: README 與最終驗證

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 全部模組
- Produces: 使用說明

- [ ] **Step 1: 撰寫 `README.md`**

````markdown
# The Museum of Me（仿作）

仿 Intel × Rhizomatiks《The Museum of Me》（2011）：選擇照片、填入名字與關鍵字，生成一段在純白 3D 美術館中漫步的紀念影片，並直接在瀏覽器中匯出 MP4。照片與音樂不會離開你的電腦。

## 使用

```bash
npm install
npm run dev        # http://localhost:5173
```

1. 選擇 3–60 張照片，拖曳或用 ↑↓ 調整順序，勾選一張「主視覺」。
2. 填入主角名字（必填）、副標題、日期、關鍵字與照片說明。
3. 選擇長度（自動或 30／60／90／120 秒）、解析度（720p／1080p），可上傳配樂。
4. 「布置展廳」後即可預覽；「匯出影片」會逐格渲染並下載 `museum-of-<名字>-<日期>.mp4`。

建議使用最新版 Chrome 或 Edge（需要 WebCodecs H.264 編碼）；其他瀏覽器若只支援 VP9，會改為輸出 WebM。

## 場景

開場（標題牆）→ 大廳（主視覺肖像）→ 肖像長廊 → 主展廳（逐張展示＋解說牌）→ 關鍵字廳 → 網絡裝置 → 終章（參觀者凝視肖像、白場片尾字卡）。30 秒版省略關鍵字廳與網絡裝置；沒有關鍵字時省略關鍵字廳。

## 開發

```bash
npm test           # Vitest 單元測試（時間表、配置、鏡頭、配樂、場景）
npm run test:e2e   # Playwright（使用系統 Google Chrome；匯出測試需數分鐘）
npm run typecheck
npm run build
npm run fixtures   # 重新產生 tests/fixtures（需要 ffmpeg）
```

架構與設計決策見 `docs/superpowers/specs/2026-09-28-museum-of-me-design.md`。
````

- [ ] **Step 2: 完整驗證**

Run: `npm test && npm run typecheck && npm run build && npx playwright test`
Expected: 全部 PASS，`dist/` 產出成功

- [ ] **Step 3: 手動驗收**

`npm run dev`，用自己的 10 張手機照片（含直拍）走一次完整流程：自動長度、1080p、上傳一首 mp3。確認：直拍照片方向正確；中文名字在入口牆與片尾字卡正確顯示；預覽中播放／暫停／拖曳時間軸正常；匯出的 MP4 能在系統播放器播放，聲音與畫面同步、結尾淡出。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: add README with usage, scenes and development commands"
```
