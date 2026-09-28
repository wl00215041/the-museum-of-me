# The Museum of Me v3（一鏡到底）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依原作逐格分析，把 v2 的分鏡切換改成一鏡到底：所有房間沿 x 軸並排在同一個場景中，鏡頭以 x 等速橫移穿過隔柱與轉角；機器手臂房之後鏡頭下降掠過地毯，地毯直接變成馬賽克，再變成網絡。同時修正 v2 最終審查的三個 Important 問題。

**Architecture:** `plan/sequence`（分段時長）→ `stage/strip`（展廳帶：房間 x 範圍、交界、物件、障礙物，純資料）→ `camera/path`（行進段解析式＋收尾 Hermite，位置與速度連續）與 `stage/world`（一個 `THREE.Scene`：外殼、各房間、收尾）→ `render/world-renderer`（DOF、依房間的 bloom、sRGB 調色）。v3 模組以新檔名建立，Task 12 才切換並刪除 v2 的分鏡模組。

**Tech Stack:** 同 v2。

**Spec:** `docs/superpowers/specs/2026-09-28-museum-of-me-v3-design.md`（未取代的部分沿用 v2 與 v1 規格）

## Global Constraints

- 分段 id 與順序：`title, exhibition, intro, portraits, photos, moments, words, likes, videos, robots, dive, mosaic, network, ending`。行進段為 `title` 到 `robots`。
- 基準時長（秒）：title 5、exhibition 10、intro 7、portraits 16、photos `clamp(9 + 0.3·N, 12, 24)`、moments 10、words 29、likes 14、videos 16、robots 28、dive 12、mosaic 12、network 24、ending 8。
- 固定長度組合：30 s = `title, exhibition, photos, robots, dive, mosaic, ending`；60 s 再加 `intro, portraits, words, network`；90 s 再加 `moments, likes`；120 s 全部。
- 行進線：z = 7、眼高 1.6、注視高度 1.85、垂直 FOV 38°、基準速度 1.1 m/s、起始偏航 18°；偏航角在 `t_par = exhibition 起點 + 0.2·時長` 歸零；展名在 `t_ex = exhibition 起點 + 0.55·時長` 位於正中。
- 在行進段中，x 方向每一幀的位移完全相同（`x = V·t`）。
- 牆上文字 `#141414`；白牆 `#d9d8d4`；暗牆 `#161616`；暗地 `#101010`。
- 調色在 sRGB 中進行：飽和度 0.88、黑位抬高 0.012、顆粒 0.03 × (0.25 + 0.75·亮度)。純黑背景的中位亮度必須低於 20/255。
- 不得出現 Intel、Core、Facebook 等商標文字或標誌。
- 決定性規則同 v2。

## Review Focus

1. **30 秒版本**：展廳帶只有白牆、Photos 與機器手臂房，鏡頭一樣要等速、連續，且馬賽克來自地毯 → Task 5 的 `strip.test.ts`「30 s cut」與 Task 6 的 `path.test.ts`「every preset is continuous」。
2. **Words 推近後接任何房間**（60 秒版本接的是機器手臂房，不是 Likes）：下一段的前 20% 必須退回 z = 7，交界不能擋住鏡頭 → Task 6 的「never enters an obstacle」。
3. **很長的名字或 CJK 名字**：展名縮放以放進框內，而且不能與說明文字重疊 → Task 5 的「wall texts never overlap」加上 Task 8 的「long name fits」。
4. **只有 3 張照片**：Friends、Moments（至少 4 座燈箱）、地毯、網絡都要正常 → Task 5 的「three photos」。
5. **超過 256 張照片**：地毯與 Photos 牆依圖集分組，照片不錯位 → Task 10 的「carpet spans atlases」。

## File Structure（v3 新增或改動）

```
src/render/grade-effect.ts          sRGB 調色（Task 1）
src/audio/chunks.ts                 分段合成的純函式（Task 2）
src/audio/soundtrack.ts             分段合成 + PeriodicWave（Task 2）
src/export/yield.ts                 非計時器的讓出（Task 3）
src/types.ts                        + SegmentId, SEGMENT_ORDER, Segment, Sequence
src/plan/sequence.ts                buildSequence, segmentIndexAt, findSegment, requireSegment
src/stage/placement.ts              從 v2 layout 移出的擺放函式（photoSwarm, networkLayout …）
src/stage/strip.ts                  computeStrip（純資料）
src/camera/spline.ts                可指定端點速度的 Hermite
src/camera/path.ts                  buildCameraPath
src/assets/text.ts / texture-factory.ts   + concrete()
src/stage/world/{context,common,shell,finale,world}.ts
src/stage/world/rooms/{wall,portraits,photos,moments,words,likes,videos,robots}.ts
src/render/world-fades.ts, src/render/world-renderer.ts
src/app/project.ts, src/main.ts     改接 v3（Task 12）
scripts/compare-original.mjs        與原作並排比對（Task 13）
刪除（Task 12）：plan/storyboard.ts、stage/{layout,wall-run,context,build,dispose→保留}.ts、stage/sets/**、camera/shots.ts、render/{transitions,stage-renderer}.ts 及其測試
```

---

### Task 1: 調色改在 sRGB 中進行（審查 Important #1）

**Files:**
- Modify: `src/render/grade-effect.ts`（整檔取代）、`tests/e2e/preview.spec.ts`（新增一個斷言）

**Interfaces:**
- Produces: `GradeEffect` 介面不變（`setState(fade, frame)`、`LETTERBOX_HALF`）；uniform 預設值改為 saturation 0.88、lift 0.012、grain 0.03

- [ ] **Step 1: 寫失敗的斷言**

在 `tests/e2e/preview.spec.ts` 的「every shot renders…」測試迴圈內，`if (KIND[shot.id] === 'dark') …` 之後加上：
```ts
    if (shot.id === 'network') expect(stats.median, 'network background should be near-black').toBeLessThan(20);
```

Run: `npx playwright test tests/e2e/preview.spec.ts -g "every shot"`
Expected: FAIL（`network background should be near-black`，中位亮度約 40）

- [ ] **Step 2: 取代 `src/render/grade-effect.ts`**

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

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Effects run in linear light and are encoded to sRGB at the end; grading happens in display space.
  vec3 s = toSrgb(clamp(inputColor.rgb, 0.0, 1.0));
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s = mix(vec3(l), s, saturation);
  s = s * (1.0 - lift) + lift;
  s += (hash(gl_FragCoord.xy + seed) - 0.5) * grainAmount * (0.25 + 0.75 * l);
  vec3 c = toLinear(clamp(s, 0.0, 1.0));
  c = mix(c, fadeColor, fadeAmount);
  if (abs(uv.y - 0.5) > letterbox) c = vec3(0.0);
  outputColor = vec4(c, 1.0); // video frames are always opaque
}
`;

/** Desaturation, a slight black lift and luminance-weighted grain in sRGB, fades and the 2.35:1 letterbox. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['fadeColor', new Uniform(new Vector3(1, 1, 1))],
        ['fadeAmount', new Uniform(0)],
        ['grainAmount', new Uniform(0.03)],
        ['seed', new Uniform(0)],
        ['letterbox', new Uniform(LETTERBOX_HALF)],
        ['saturation', new Uniform(0.88)],
        ['lift', new Uniform(0.012)],
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

（`Fade` 型別在 Task 12 會改由 `render/world-fades.ts` 提供，屆時只需改這一行 import。）

- [ ] **Step 3: 執行確認通過**

Run: `npx vitest run && npx playwright test tests/e2e/preview.spec.ts`
Expected: 全部 PASS（network 中位亮度 < 20；其他亮度門檻仍通過）

- [ ] **Step 4: 提交**

```bash
git add src/render/grade-effect.ts tests/e2e/preview.spec.ts
git commit -m "fix: grade in sRGB so blacks stay black (review Important #1)"
```

---

### Task 2: 分段合成配樂（審查 Important #2）

**Files:**
- Create: `src/audio/chunks.ts`
- Modify: `src/audio/soundtrack.ts`（`synthesizeSoundtrack` 改寫）、`tests/e2e/audio.spec.ts`（新增效能測試）
- Test: `tests/unit/chunks.test.ts`

**Interfaces:**
- Consumes: `NoteEvent`, `composeScore`, `composeAiryScore`, `TAIL`（v2）
- Produces: `CHUNK_SECONDS = 16`、`RING_SECONDS = 6`、`interface NoteChunk { start; end; events }`、`chunkNotes(events, duration, chunk?)`、`overlapAdd(dst, src, offset)`、`applyMaster(channels, sampleRate, fadeIn, tail, level)`；`synthesizeSoundtrack` 簽名不變

- [ ] **Step 1: 寫失敗的測試**

`tests/unit/chunks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyMaster, chunkNotes, overlapAdd } from '../../src/audio/chunks';
import type { NoteEvent } from '../../src/audio/score';

const note = (time: number): NoteEvent => ({ time, midi: 60, velocity: 0.5, duration: 1, voice: 'piano' });

describe('chunkNotes', () => {
  it('puts every note in exactly one chunk, by start time', () => {
    const events = [0, 3, 15.99, 16, 31, 40].map(note);
    const chunks = chunkNotes(events, 41, 16);
    expect(chunks.map((c) => [c.start, c.end])).toEqual([[0, 16], [16, 32], [32, 41]]);
    expect(chunks.map((c) => c.events.map((e) => e.time))).toEqual([[0, 3, 15.99], [16, 31], [40]]);
  });

  it('always returns at least one chunk', () => {
    expect(chunkNotes([], 5, 16)).toEqual([{ start: 0, end: 5, events: [] }]);
  });
});

describe('overlapAdd', () => {
  it('adds into the destination and clips at its end', () => {
    const dst = new Float32Array([1, 1, 1, 1]);
    overlapAdd(dst, new Float32Array([1, 2, 3]), 2);
    expect(Array.from(dst)).toEqual([1, 1, 2, 3]);
  });
});

describe('applyMaster', () => {
  it('fades in from silence, fades out to silence and keeps peaks below 1', () => {
    const sr = 1000;
    const ch = new Float32Array(10 * sr).fill(2);
    applyMaster([ch], sr, 0.5, 3, 0.8);
    expect(ch[0]).toBe(0);
    expect(ch[ch.length - 1]).toBeCloseTo(0, 6);
    expect(Math.max(...ch)).toBeLessThan(1);
    expect(ch[5 * sr]).toBeGreaterThan(0.9);
  });
});
```

`tests/e2e/audio.spec.ts` 檔尾新增：
```ts
test('synthesizes a 137 s airy soundtrack within 6 s', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const started = performance.now();
    const buf: AudioBuffer = await m.synthesizeSoundtrack(137, 11, 'airy');
    const ms = performance.now() - started;
    const ch = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]));
    return { ms, duration: buf.duration, peak };
  });
  expect(r.duration).toBeCloseTo(137, 2);
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.peak).toBeLessThan(1);
  expect(r.ms).toBeLessThan(6000);
});
```

Run: `npx vitest run tests/unit/chunks.test.ts; npx playwright test tests/e2e/audio.spec.ts -g "137 s"`
Expected: 單元測試 FAIL（找不到模組）；e2e FAIL（約 20 s，超過 6000 ms）

- [ ] **Step 2: 實作 `src/audio/chunks.ts`**

```ts
import type { NoteEvent } from './score';

export const CHUNK_SECONDS = 16;
/** Longest release + reverb tail a chunk has to keep rendering past its end. */
export const RING_SECONDS = 6;

export interface NoteChunk {
  start: number;
  end: number;
  events: NoteEvent[];
}

export function chunkNotes(events: NoteEvent[], duration: number, chunk = CHUNK_SECONDS): NoteChunk[] {
  const count = Math.max(1, Math.ceil(duration / chunk));
  const chunks: NoteChunk[] = Array.from({ length: count }, (_, k) => ({
    start: k * chunk,
    end: Math.min(duration, (k + 1) * chunk),
    events: [],
  }));
  for (const ev of events) chunks[Math.min(count - 1, Math.max(0, Math.floor(ev.time / chunk)))].events.push(ev);
  return chunks;
}

export function overlapAdd(dst: Float32Array, src: Float32Array, offset: number): void {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) dst[offset + i] += src[i];
}

/** Master gain with a linear fade in/out, then a soft knee above 0.9 so nothing reaches full scale. */
export function applyMaster(channels: Float32Array[], sampleRate: number, fadeIn: number, tail: number, level: number): void {
  const inEnd = fadeIn * sampleRate;
  for (const data of channels) {
    const outStart = data.length - tail * sampleRate;
    for (let i = 0; i < data.length; i++) {
      const env = Math.min(1, i / inEnd, Math.max(0, (data.length - 1 - i) / (data.length - 1 - outStart)));
      const x = data[i] * level * env;
      const a = Math.abs(x);
      data[i] = a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.099 * Math.tanh((a - 0.9) / 0.099));
    }
  }
}
```

- [ ] **Step 3: 改寫 `src/audio/soundtrack.ts` 的合成**

把檔案中 `playPartials`、`PIANO`、`BELL`、`masterChain` 以外、從 `export async function synthesizeSoundtrack` 開始到該函式結束的整段，換成：
```ts
function pianoWave(ctx: BaseAudioContext): PeriodicWave {
  // Harmonics 1–4 with the same weights the additive voice used, as one oscillator per note.
  return ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.45, 0.18, 0.08]));
}

function playPiano(ctx: BaseAudioContext, out: AudioNode, wave: PeriodicWave, ev: NoteEvent): void {
  const decay = 1.2 + (96 - ev.midi) / 40;
  const stopAt = ev.time + ev.duration + decay;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, ev.time);
  env.gain.linearRampToValueAtTime(ev.velocity * 0.6, ev.time + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0005, stopAt);
  env.connect(out);
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = midiToHz(ev.midi);
  osc.connect(env);
  osc.start(ev.time);
  osc.stop(stopAt + 0.05);
}

async function runLimited(jobs: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  }));
}

/** Renders the score in 16 s chunks (small node graphs render much faster) and overlap-adds them. */
export async function synthesizeSoundtrack(duration: number, seed: number, style: 'calm' | 'airy' = 'calm'): Promise<AudioBuffer> {
  const airy = style === 'airy';
  const events = airy ? composeAiryScore(duration, seed) : composeScore(duration, seed);
  const length = Math.ceil(duration * SAMPLE_RATE);
  const out = [new Float32Array(length), new Float32Array(length)];
  const renderChunk = async (chunk: NoteChunk) => {
    const ctx = new OfflineAudioContext(2, Math.ceil((chunk.end - chunk.start + RING_SECONDS) * SAMPLE_RATE), SAMPLE_RATE);
    const bus = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = airy ? 0.65 : 0.8;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx, airy ? 4.5 : 3.2, seed);
    const wet = ctx.createGain();
    wet.gain.value = airy ? 0.5 : 0.35;
    bus.connect(dry).connect(ctx.destination);
    bus.connect(reverb).connect(wet).connect(ctx.destination);
    const wave = pianoWave(ctx);
    for (const ev of chunk.events) {
      const local = { ...ev, time: ev.time - chunk.start };
      if (ev.voice === 'pad') playPad(ctx, bus, local);
      else if (ev.voice === 'bell') playPartials(ctx, bus, local, BELL, 2.5, 0.3);
      else playPiano(ctx, bus, wave, local);
    }
    const rendered = await ctx.startRendering();
    const offset = Math.round(chunk.start * SAMPLE_RATE);
    for (let c = 0; c < 2; c++) overlapAdd(out[c], rendered.getChannelData(c), offset);
  };
  await runLimited(chunkNotes(events, duration).map((chunk) => () => renderChunk(chunk)), 4);
  applyMaster(out, SAMPLE_RATE, FADE_IN, TAIL, 0.8);
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  out.forEach((data, c) => buffer.copyToChannel(data, c));
  return buffer;
}
```
並把檔案開頭的 import 改為：
```ts
import type { MusicStyle } from '../types';
import { mulberry32 } from '../util/rng';
import { CHUNK_SECONDS, RING_SECONDS, applyMaster, chunkNotes, overlapAdd, type NoteChunk } from './chunks';
import { TAIL, composeAiryScore, composeScore, type NoteEvent } from './score';
```
刪除已不再使用的 `const PIANO = …` 一行（`playPartials` 仍供鐘聲使用）。`CHUNK_SECONDS` 若沒有用到就不要 import，以免 `noUnusedLocals` 報錯。

- [ ] **Step 4: 執行確認通過**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test tests/e2e/audio.spec.ts`
Expected: 全部 PASS（chunks 4 passed；audio e2e 7 passed，其中 137 s 合成少於 6000 ms）。若效能測試仍失敗：把 `runLimited` 的並行數從 4 提高到 6，再重新量測；把結果寫進記錄。

- [ ] **Step 5: 提交**

```bash
git add src/audio tests/unit/chunks.test.ts tests/e2e/audio.spec.ts
git commit -m "perf: chunked soundtrack synthesis with PeriodicWave piano (review Important #2)"
```

---

### Task 3: 匯出改用不受背景節流的讓出（審查 Important #3）

**Files:**
- Create: `src/export/yield.ts`
- Modify: `src/export/exporter.ts`
- Test: `tests/unit/yield.test.ts`

**Interfaces:**
- Produces: `yieldToEventLoop(): Promise<void>`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/yield.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { yieldToEventLoop } from '../../src/export/yield';

describe('yieldToEventLoop', () => {
  it('resolves without using timers (hidden tabs throttle timers)', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await yieldToEventLoop();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('lets queued tasks run before resolving', async () => {
    let ran = false;
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => { ran = true; port1.close(); };
    port2.postMessage(null);
    await yieldToEventLoop();
    expect(ran).toBe(true);
  });

  it('the exporter no longer yields through setTimeout', () => {
    expect(readFileSync('src/export/exporter.ts', 'utf8')).not.toContain('setTimeout');
  });
});
```

Run: `npx vitest run tests/unit/yield.test.ts`
Expected: FAIL（找不到 `../../src/export/yield`）

- [ ] **Step 2: 實作並替換**

`src/export/yield.ts`:
```ts
/** Lets the event loop run (repaint, input) without timers, which browsers throttle in background tabs. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}
```

`src/export/exporter.ts`：
- 在 import 區加上 `import { yieldToEventLoop } from './yield';`
- 把 `if (i % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0)); // let the UI repaint` 改為 `if (i % 10 === 0) await yieldToEventLoop(); // let the UI repaint`

- [ ] **Step 3: 執行確認通過**

Run: `npx vitest run tests/unit/yield.test.ts && npx playwright test tests/e2e/export.spec.ts`
Expected: PASS（yield 3 passed；匯出 2 passed）

- [ ] **Step 4: 提交**

```bash
git add src/export tests/unit/yield.test.ts
git commit -m "fix: yield the export loop through MessageChannel, not throttled timers (review Important #3)"
```

---

### Task 4: 一鏡到底的分段時長 `plan/sequence.ts`

**Files:**
- Modify: `src/types.ts`（檔尾新增）
- Create: `src/plan/sequence.ts`
- Test: `tests/unit/sequence.test.ts`

**Interfaces:**
- Produces: `SegmentId`、`SEGMENT_ORDER`、`Segment { id; start; end }`、`Sequence { total; segments }`；`SEQUENCE_BASE`、`photosSegmentSeconds(n)`、`presetSegments(preset)`、`segmentsForLength(seconds)`、`interface SequenceInput { photoCount; lengthMode; musicDuration }`、`buildSequence(input)`、`segmentIndexAt(seq, t)`、`findSegment(seq, id): Segment | null`、`requireSegment(seq, id): Segment`、`localU(segment, t)`

- [ ] **Step 1: 在 `src/types.ts` 檔尾新增**

```ts

export type SegmentId =
  | 'title' | 'exhibition' | 'intro' | 'portraits' | 'photos' | 'moments' | 'words'
  | 'likes' | 'videos' | 'robots' | 'dive' | 'mosaic' | 'network' | 'ending';

export const SEGMENT_ORDER: readonly SegmentId[] = [
  'title', 'exhibition', 'intro', 'portraits', 'photos', 'moments', 'words',
  'likes', 'videos', 'robots', 'dive', 'mosaic', 'network', 'ending',
];

export interface Segment {
  id: SegmentId;
  start: number;
  end: number;
}

export interface Sequence {
  total: number;
  segments: Segment[];
}
```

- [ ] **Step 2: 寫失敗的測試 `tests/unit/sequence.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSequence, findSegment, localU, photosSegmentSeconds, presetSegments, requireSegment, segmentIndexAt, segmentsForLength,
} from '../../src/plan/sequence';
import { SEGMENT_ORDER, type LengthMode, type Sequence } from '../../src/types';

const ids = (s: Sequence) => s.segments.map((x) => x.id);

function expectContiguous(s: Sequence): void {
  expect(s.segments[0].start).toBe(0);
  for (let i = 1; i < s.segments.length; i++) expect(s.segments[i].start).toBeCloseTo(s.segments[i - 1].end, 9);
  expect(s.segments.at(-1)!.end).toBe(s.total);
}

describe('buildSequence', () => {
  it('auto mode follows the original film timing', () => {
    const s = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
    expect(ids(s)).toEqual([...SEGMENT_ORDER]);
    expect(s.total).toBeCloseTo(206, 9);
    const ex = requireSegment(s, 'exhibition');
    expect(ex.start + 0.55 * (ex.end - ex.start)).toBeCloseTo(10.5, 9);
    expectContiguous(s);
  });

  it('scales the photo wall with the photo count, within 12–24 s', () => {
    expect(photosSegmentSeconds(3)).toBe(12);
    expect(photosSegmentSeconds(20)).toBe(15);
    expect(photosSegmentSeconds(500)).toBe(24);
  });

  it('every fixed length keeps robots, dive and mosaic together and totals exactly', () => {
    for (const [mode, count] of [[30, 7], [60, 11], [90, 13], [120, 14]] as const) {
      const s = buildSequence({ photoCount: 12, lengthMode: mode, musicDuration: null });
      expect(s.total).toBe(mode);
      expect(s.segments).toHaveLength(count);
      for (const id of ['title', 'exhibition', 'photos', 'robots', 'dive', 'mosaic', 'ending'] as const) expect(ids(s)).toContain(id);
      expectContiguous(s);
    }
    expect(ids(buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null }))).toEqual(['title', 'exhibition', 'photos', 'robots', 'dive', 'mosaic', 'ending']);
  });

  it('music mode clamps to 30–300 s and picks presets by threshold', () => {
    for (const [music, total, count] of [[10, 30, 7], [70, 70, 11], [100, 100, 13], [500, 300, 14]] as const) {
      const s = buildSequence({ photoCount: 12, lengthMode: 'music', musicDuration: music });
      expect(s.total).toBe(total);
      expect(s.segments).toHaveLength(count);
    }
  });

  it('rejects bad input', () => {
    expect(() => buildSequence({ photoCount: 0, lengthMode: 'auto', musicDuration: null })).toThrow();
    expect(() => buildSequence({ photoCount: 5, lengthMode: 'music', musicDuration: null })).toThrow();
  });

  it('keeps the original order in every mode', () => {
    const modes: LengthMode[] = ['auto', 30, 60, 90, 120];
    for (const lengthMode of modes) {
      const order = ids(buildSequence({ photoCount: 9, lengthMode, musicDuration: null })).map((id) => SEGMENT_ORDER.indexOf(id));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });
});

describe('helpers', () => {
  const s = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null });

  it('segmentIndexAt, findSegment, requireSegment and localU', () => {
    expect(segmentIndexAt(s, -1)).toBe(0);
    expect(segmentIndexAt(s, 5)).toBe(1);
    expect(segmentIndexAt(s, 1e6)).toBe(s.segments.length - 1);
    expect(findSegment(buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null }), 'words')).toBeNull();
    expect(() => requireSegment(buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null }), 'words')).toThrow();
    const ex = requireSegment(s, 'exhibition');
    expect(localU(ex, ex.start - 1)).toBe(0);
    expect(localU(ex, (ex.start + ex.end) / 2)).toBe(0.5);
    expect(localU(ex, ex.end + 1)).toBe(1);
  });

  it('presets match the thresholds', () => {
    expect(segmentsForLength(44)).toEqual(presetSegments(30));
    expect(segmentsForLength(74)).toEqual(presetSegments(60));
    expect(segmentsForLength(104)).toEqual(presetSegments(90));
    expect(segmentsForLength(105)).toEqual(presetSegments(120));
  });
});
```

Run: `npx vitest run tests/unit/sequence.test.ts`
Expected: FAIL（找不到 `../../src/plan/sequence`）

- [ ] **Step 3: 實作 `src/plan/sequence.ts`**

```ts
import { SEGMENT_ORDER, type LengthMode, type Segment, type SegmentId, type Sequence } from '../types';
import { clamp } from '../util/math';

/** Base seconds per segment, measured on the original film. */
export const SEQUENCE_BASE: Record<SegmentId, number> = {
  title: 5, exhibition: 10, intro: 7, portraits: 16, photos: 15, moments: 10, words: 29,
  likes: 14, videos: 16, robots: 28, dive: 12, mosaic: 12, network: 24, ending: 8,
};

export const photosSegmentSeconds = (n: number): number => clamp(9 + 0.3 * n, 12, 24);

type Preset = 30 | 60 | 90 | 120;

const PRESETS: Record<Exclude<Preset, 120>, readonly SegmentId[]> = {
  30: ['title', 'exhibition', 'photos', 'robots', 'dive', 'mosaic', 'ending'],
  60: ['title', 'exhibition', 'intro', 'portraits', 'photos', 'words', 'robots', 'dive', 'mosaic', 'network', 'ending'],
  90: ['title', 'exhibition', 'intro', 'portraits', 'photos', 'moments', 'words', 'likes', 'robots', 'dive', 'mosaic', 'network', 'ending'],
};

export interface SequenceInput {
  photoCount: number;
  lengthMode: LengthMode;
  musicDuration: number | null;
}

export function presetSegments(preset: Preset): SegmentId[] {
  if (preset === 120) return [...SEGMENT_ORDER];
  const allowed = new Set(PRESETS[preset]);
  return SEGMENT_ORDER.filter((id) => allowed.has(id));
}

export function segmentsForLength(seconds: number): SegmentId[] {
  return presetSegments(seconds < 45 ? 30 : seconds < 75 ? 60 : seconds < 105 ? 90 : 120);
}

export function buildSequence(input: SequenceInput): Sequence {
  const n = input.photoCount;
  if (!Number.isInteger(n) || n < 1) throw new Error(`photoCount must be a positive integer, got ${n}`);
  const base = (id: SegmentId) => (id === 'photos' ? photosSegmentSeconds(n) : SEQUENCE_BASE[id]);
  let ids: SegmentId[];
  let target: number | null;
  if (input.lengthMode === 'auto') {
    ids = [...SEGMENT_ORDER];
    target = null;
  } else if (input.lengthMode === 'music') {
    if (!input.musicDuration || input.musicDuration <= 0) throw new Error('music length mode needs a music duration');
    target = clamp(input.musicDuration, 30, 300);
    ids = segmentsForLength(target);
  } else {
    target = input.lengthMode;
    ids = presetSegments(input.lengthMode);
  }
  const sum = ids.reduce((s, id) => s + base(id), 0);
  const scale = target === null ? 1 : target / sum;
  let cursor = 0;
  const segments: Segment[] = ids.map((id) => {
    const segment = { id, start: cursor, end: cursor + base(id) * scale };
    cursor = segment.end;
    return segment;
  });
  const total = target ?? cursor;
  segments[segments.length - 1].end = total;
  return { total, segments };
}

export function segmentIndexAt(sequence: Sequence, t: number): number {
  const { segments } = sequence;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const findSegment = (sequence: Sequence, id: SegmentId): Segment | null => sequence.segments.find((s) => s.id === id) ?? null;

export function requireSegment(sequence: Sequence, id: SegmentId): Segment {
  const segment = findSegment(sequence, id);
  if (!segment) throw new Error(`sequence has no "${id}" segment`);
  return segment;
}

export const localU = (segment: Segment, t: number): number => clamp((t - segment.start) / (segment.end - segment.start), 0, 1);
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/sequence.test.ts && npx tsc --noEmit`
Expected: PASS（8 passed）

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/plan/sequence.ts tests/unit/sequence.test.ts
git commit -m "feat(v3): one-take sequence timing measured on the original film"
```

---
### Task 5: 展廳帶配置 `stage/placement.ts`、`stage/strip.ts`

**Files:**
- Create: `src/stage/placement.ts`（從 v2 `stage/layout.ts` 複製出擺放函式；v2 檔在 Task 12 刪除）、`src/stage/strip.ts`
- Test: `tests/unit/strip.test.ts`

**Interfaces:**
- Consumes: `Sequence`, `SegmentId`, `requireSegment`, `findSegment`（Task 4）；`clamp`, `lerp`, `smoothstep`, `mulberry32`
- Produces:
  - `placement.ts`：`MAX_NETWORK_NODES`, `STARS`, `CanvasItem`, `VisitorSpot`, `NetworkLayout`, `pickSpread`, `spot`, `photoSwarm(aspects, xa, xb, rnd, wallHeight?)`, `shuffle`, `fibonacci`, `networkLayout(n, portraitIndex, rnd)`
  - `strip.ts`：常數 `LINE`, `TEXT`, `BOUNDARY`, `CARPET`, `PUSH`, `ROBOTS`, `WALK_SEGMENTS`；型別 `RoomId`, `Room`, `Boundary`, `Box`, `WallText`, `Label`, `Monitor`, `Strip`, `StripInput`；`yawAt(strip, t)`, `roomAtX(strip, x)`, `computeStrip(input)`

- [ ] **Step 1: 建立 `src/stage/placement.ts`**

```ts
import type { Vec3 } from '../types';
import { clamp, lerp } from '../util/math';

export const MAX_NETWORK_NODES = 150;
export const STARS = 2400;

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

export interface NetworkLayout {
  nodes: { photoIndex: number; pos: Vec3; radius: number }[];
  /** Pairs of node indices; -1 is the central portrait sphere. */
  edges: [number, number][];
  /** Flat xyz star positions. */
  stars: number[];
  starEdges: [number, number][];
  highlights: number[];
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

export const spot = (pos: Vec3, pose: 0 | 1 | 2, rnd: () => number, dark = false, yaw = Math.PI): VisitorSpot => ({
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

/** Salon-style swarm rising from lower left to upper right, thickening as it goes (the original's Photos wall). */
export function photoSwarm(aspects: number[], xa: number, xb: number, rnd: () => number, wallHeight = 6, z = 0): CanvasItem[] {
  const n = aspects.length;
  const span = xb - xa;
  const base = clamp(Math.sqrt((span * 1.6) / n) * 0.72, 0.22, 0.95);
  const placed: CanvasItem[] = [];
  aspects.forEach((aspect, photoIndex) => {
    const u = (photoIndex + 0.5) / n;
    const long = base * (0.8 + 0.4 * rnd());
    const { width, height } = canvasSize(aspect, long);
    const centerY = lerp(1.25, 3.4, u ** 0.8);
    const thickness = lerp(0.4, 2.4, u);
    const x = xa + u * span + (rnd() - 0.5) * Math.min(span / n, 1.2) * 1.5;
    let best: Vec3 = [x, clamp(centerY, 0.6 + height / 2, wallHeight - 0.6 - height / 2), z];
    let bestOverlap = Infinity;
    for (let k = 0; k < 12; k++) {
      const y = clamp(centerY + (rnd() - 0.5) * thickness, 0.6 + height / 2, wallHeight - 0.6 - height / 2);
      const cx = x + (rnd() - 0.5) * 0.3 * long;
      const overlap = overlapWithRecent(placed, cx, y, width, height);
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = [cx, y, z];
        if (overlap === 0) break;
      }
    }
    placed.push({ photoIndex, center: best, width, height });
  });
  return placed;
}

export function shuffle(n: number, rnd: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fibonacci(count: number): Vec3[] {
  if (count === 1) return [[0, 1, 0]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i): Vec3 => {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
  });
}

/** Photo spheres around the portrait, each linked to its two nearest neighbours, inside a star shell. */
export function networkLayout(n: number, portraitIndex: number, rnd: () => number): NetworkLayout {
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
```

- [ ] **Step 2: 寫失敗的測試 `tests/unit/strip.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import { BOUNDARY, CARPET, LINE, TEXT, computeStrip, roomAtX, yawAt, type Strip } from '../../src/stage/strip';
import type { LengthMode } from '../../src/types';

const aspectsFor = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78, 0.5][i % 5]);

function make(n: number, lengthMode: LengthMode = 'auto', name = '') {
  const sequence = buildSequence({ photoCount: n, lengthMode, musicDuration: null });
  return { sequence, strip: computeStrip({ sequence, aspects: aspectsFor(n), portraitIndex: Math.min(1, n - 1), seed: 3 + name.length }) };
}

const allFinite = (v: unknown): boolean =>
  typeof v === 'number' ? Number.isFinite(v)
  : Array.isArray(v) ? v.every(allFinite)
  : v !== null && typeof v === 'object' ? Object.values(v).every(allFinite)
  : true;

function inRoom(strip: Strip, id: string, x: number): boolean {
  const room = strip.rooms.find((r) => r.id === id)!;
  return x >= room.x0 - 1e-9 && x <= room.x1 + 1e-9;
}

describe('computeStrip', () => {
  it('lays the rooms side by side along +x in the original order', () => {
    const { strip, sequence } = make(20);
    expect(strip.rooms.map((r) => r.id)).toEqual(['wall', 'portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots']);
    for (let i = 1; i < strip.rooms.length; i++) expect(strip.rooms[i].x0).toBeCloseTo(strip.rooms[i - 1].x1, 9);
    expect(strip.boundaries).toHaveLength(strip.rooms.length - 1);
    expect(strip.rooms[0].x0).toBe(0);
    expect(strip.speed).toBe(LINE.baseSpeed);
    expect(strip.rooms[1].x0).toBeCloseTo(strip.speed * requireSegment(sequence, 'portraits').start, 9);
    expect(strip.walkEnd).toBe(requireSegment(sequence, 'robots').end);
    expect(strip.rooms.map((r) => r.dark)).toEqual([false, false, false, true, true, true, true, false]);
  });

  it('centres the exhibition text on the camera at t_ex, with the yaw already zero', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      const { strip } = make(12, mode);
      expect(strip.wall.exhibition.center[0]).toBeCloseTo(strip.speed * strip.tEx, 9);
      expect(yawAt(strip, strip.tEx)).toBe(0);
      expect(yawAt(strip, 0)).toBeCloseTo(LINE.yaw0, 12);
      expect(strip.tPar).toBeLessThan(strip.tEx);
    }
  });

  it('wall texts never overlap and stay inside the wall room', () => {
    for (const mode of ['auto', 30, 60, 90, 120] as const) {
      for (const n of [3, 20, 500]) {
        const { strip } = make(n, mode);
        const { title, exhibition, intro } = strip.wall;
        const wallEnd = strip.rooms[0].x1;
        expect(title.center[0] + TEXT.titleWidth / 2 + TEXT.gap).toBeLessThanOrEqual(exhibition.center[0] - TEXT.exhibitionWidth / 2 + 1e-9);
        const lastRight = intro ? intro.center[0] + intro.width / 2 : exhibition.center[0] + TEXT.exhibitionWidth / 2;
        if (intro) expect(intro.avatar.center[0] - intro.avatar.width / 2).toBeGreaterThanOrEqual(exhibition.center[0] + TEXT.exhibitionWidth / 2 + TEXT.gap - 1e-9);
        expect(lastRight + TEXT.endMargin).toBeLessThanOrEqual(wallEnd + 1e-9);
      }
    }
  });

  it('keeps every exhibit inside its own room', () => {
    const { strip } = make(40);
    for (const item of strip.portraits!.items) expect(inRoom(strip, 'portraits', item.center[0])).toBe(true);
    for (const item of strip.photos.items) expect(inRoom(strip, 'photos', item.center[0])).toBe(true);
    for (const box of strip.moments!.boxes) expect(inRoom(strip, 'moments', box.center[0])).toBe(true);
    expect(inRoom(strip, 'words', strip.words!.wall.center[0])).toBe(true);
    expect(inRoom(strip, 'likes', strip.likes!.sculpture[0])).toBe(true);
    for (const m of strip.likes!.monitors) expect(inRoom(strip, 'likes', m.center[0])).toBe(true);
    for (const p of strip.videos!.panels) expect(inRoom(strip, 'videos', p.center[0])).toBe(true);
    for (const m of strip.videos!.monitors) expect(inRoom(strip, 'videos', m.center[0])).toBe(true);
    expect(inRoom(strip, 'robots', strip.robots.platform.center[0])).toBe(true);
    expect(strip.words!.wall.center[2]).toBeLessThan(-4.9);
  });

  it('puts a pillar at every boundary except the low one after the push-in', () => {
    const { strip } = make(20, 60);
    const low = strip.boundaries.filter((b) => b.low);
    expect(low.map((b) => b.left.id)).toEqual(['words']);
    expect(strip.obstacles.filter((o) => o.name === 'pillar')).toHaveLength(strip.boundaries.length - 1);
    expect(strip.obstacles.filter((o) => o.name === 'partition')).toHaveLength(strip.boundaries.length);
    for (const o of strip.obstacles.filter((o) => o.name === 'pillar')) expect(o.max[2]).toBeLessThan(LINE.z - 1);
    expect(BOUNDARY.lowDepth).toBeLessThan(1);
  });

  it('30 s cut: wall, photos and the robot room, with the carpet and finale', () => {
    const { strip } = make(20, 30);
    expect(strip.rooms.map((r) => r.id)).toEqual(['wall', 'photos', 'robots']);
    expect(strip.wall.intro).toBeNull();
    expect(strip.portraits).toBeNull();
    expect(strip.moments).toBeNull();
    expect(strip.finale.lifted[1]).toBeGreaterThan(strip.robots.platform.center[1]);
    expect(strip.featured).toEqual([strip.portraitIndex]);
  });

  it('three photos still fill every room', () => {
    const { strip } = make(3);
    expect(strip.moments!.boxes.length).toBeGreaterThanOrEqual(4);
    expect(strip.portraits!.items.length).toBeGreaterThan(0);
    expect(strip.finale.network.nodes).toHaveLength(2);
    expect(allFinite(strip)).toBe(true);
  });

  it('the carpet sits on the platform; the lift point is above it', () => {
    const { strip } = make(20);
    const p = strip.robots.platform;
    expect(strip.finale.carpet[1]).toBeCloseTo(p.height + 0.006, 9);
    expect(CARPET.cols * CARPET.pitch).toBeLessThanOrEqual(p.width);
    expect(CARPET.rows * CARPET.pitch).toBeLessThanOrEqual(p.depth);
  });

  it('roomAtX clamps to the first and last room', () => {
    const { strip } = make(20);
    expect(roomAtX(strip, -5).id).toBe('wall');
    expect(roomAtX(strip, 1e6).id).toBe('robots');
    expect(roomAtX(strip, strip.rooms[3].x0 + 0.1).id).toBe('moments');
  });

  it('is deterministic', () => {
    expect(make(30).strip).toEqual(make(30).strip);
  });
});
```

Run: `npx vitest run tests/unit/strip.test.ts`
Expected: FAIL（找不到 `../../src/stage/strip`）

- [ ] **Step 3: 實作 `src/stage/strip.ts`**

```ts
import { requireSegment } from '../plan/sequence';
import type { SegmentId, Sequence, Vec3 } from '../types';
import { clamp, lerp, smoothstep } from '../util/math';
import { mulberry32 } from '../util/rng';
import { networkLayout, photoSwarm, pickSpread, spot, type CanvasItem, type NetworkLayout, type VisitorSpot } from './placement';

export const LINE = { z: 7, eye: 1.6, lookY: 1.85, fov: 38, baseSpeed: 1.1, yaw0: (18 * Math.PI) / 180 } as const;
export const TEXT = {
  titleWidth: 5, titleHeight: 1.5, exhibitionWidth: 6.5, exhibitionHeight: 2.6,
  introTextWidth: 5.2, introHeight: 1.2, avatar: 0.9, gap: 0.8, endMargin: 1,
} as const;
export const BOUNDARY = { depth: 4.5, lowDepth: 0.8, partition: 0.6, pillarZ: 5.4, pillarWidth: 1.1, pillarDepth: 0.5 } as const;
export const CARPET = { cols: 64, rows: 36, pitch: 0.15, tile: 0.14 } as const;
/** Words push-in: z from LINE.z to `z` over [start, end] of the words segment; the next segment pulls back over its first `pullBack`. */
export const PUSH = { start: 0.3, end: 0.9, z: 1.5, pullBack: 0.2 } as const;
export const ROBOTS = { extend: 16, platform: { width: 10, depth: 6, height: 0.35 }, platformZ: -2, lead: 1.5, liftY: 3, floaters: 280 } as const;
export const WALK_SEGMENTS: readonly SegmentId[] = ['title', 'exhibition', 'intro', 'portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots'];

export type RoomId = 'wall' | 'portraits' | 'photos' | 'moments' | 'words' | 'likes' | 'videos' | 'robots';

const ROOM_OF: Partial<Record<SegmentId, RoomId>> = {
  title: 'wall', exhibition: 'wall', intro: 'wall', portraits: 'portraits', photos: 'photos',
  moments: 'moments', words: 'words', likes: 'likes', videos: 'videos', robots: 'robots',
};
const DARK: Record<RoomId, boolean> = { wall: false, portraits: false, photos: false, moments: true, words: true, likes: true, videos: true, robots: false };
const BACK_Z: Record<RoomId, number> = { wall: 0, portraits: 0, photos: 0, moments: 0, words: -5, likes: 0, videos: 0, robots: -10 };

export interface Room {
  id: RoomId;
  x0: number;
  x1: number;
  backZ: number;
  dark: boolean;
  height: number;
}

export interface Boundary {
  x: number;
  left: Room;
  right: Room;
  /** After the Words push-in the camera runs at z = PUSH.z, so this boundary stops short and has no pillar. */
  low: boolean;
}

export interface Box {
  name: string;
  min: Vec3;
  max: Vec3;
}

export interface WallText {
  center: Vec3;
  width: number;
  height: number;
}

export interface Label {
  text: string;
  number: string;
  at: Vec3;
  dark: boolean;
}

export interface Monitor {
  center: Vec3;
  /** Facing direction of the screen (unit, on the xz plane). */
  normal: Vec3;
  width: number;
  height: number;
  bars: boolean;
  photoIndex: number;
}

export interface Strip {
  speed: number;
  /** End time of the walking part (the robots segment). */
  walkEnd: number;
  tTitle: number;
  tPar: number;
  tEx: number;
  rooms: Room[];
  boundaries: Boundary[];
  obstacles: Box[];
  wall: { title: WallText; exhibition: WallText; intro: (WallText & { avatar: CanvasItem }) | null };
  portraits: { label: Label; items: CanvasItem[]; visitors: VisitorSpot[] } | null;
  photos: { label: Label; items: CanvasItem[]; visitors: VisitorSpot[] };
  moments: { label: Label; boxes: CanvasItem[]; visitors: VisitorSpot[] } | null;
  words: { label: Label; wall: WallText; visitors: VisitorSpot[] } | null;
  likes: { label: Label; sculpture: Vec3; monitors: Monitor[]; visitors: VisitorSpot[] } | null;
  videos: {
    label: Label;
    photoIndex: number;
    panels: { col: number; row: number; center: Vec3; width: number; height: number }[];
    monitors: Monitor[];
    visitors: VisitorSpot[];
  } | null;
  robots: {
    platform: { center: Vec3; width: number; depth: number; height: number };
    arms: { pos: Vec3; yaw: number; phase: number }[];
    floaters: { photoIndex: number; pos: Vec3; size: number; phase: number }[];
  };
  finale: { carpet: Vec3; lifted: Vec3; network: NetworkLayout; card: Vec3 };
  featured: number[];
  portraitIndex: number;
}

export interface StripInput {
  sequence: Sequence;
  aspects: number[];
  portraitIndex: number;
  seed: number;
}

export const yawAt = (strip: Pick<Strip, 'tPar'>, t: number): number => LINE.yaw0 * (1 - smoothstep(0, strip.tPar, t));

export function roomAtX(strip: Pick<Strip, 'rooms'>, x: number): Room {
  for (const room of strip.rooms) if (x < room.x1) return room;
  return strip.rooms[strip.rooms.length - 1];
}

interface WallTimes {
  tTitle: number;
  tPar: number;
  tEx: number;
  tIntro: number | null;
  wallEnd: number;
}

function wallTexts(V: number, times: WallTimes): { wall: Strip['wall']; fits: boolean } {
  const focus = (t: number) => V * t + LINE.z * Math.tan(yawAt(times, t));
  const title: WallText = { center: [focus(times.tTitle) + 0.4, 2.55, 0], width: TEXT.titleWidth, height: TEXT.titleHeight };
  const exX = V * times.tEx;
  const exhibition: WallText = { center: [exX, 2.25, 0], width: TEXT.exhibitionWidth, height: TEXT.exhibitionHeight };
  const exRight = exX + TEXT.exhibitionWidth / 2;
  let intro: Strip['wall']['intro'] = null;
  let lastRight = exRight;
  if (times.tIntro !== null) {
    const blockW = TEXT.avatar + 0.2 + TEXT.introTextWidth;
    const blockCenter = Math.max(V * times.tIntro, exRight + TEXT.gap + blockW / 2);
    const left = blockCenter - blockW / 2;
    intro = {
      center: [left + TEXT.avatar + 0.2 + TEXT.introTextWidth / 2, 2.45, 0],
      width: TEXT.introTextWidth,
      height: TEXT.introHeight,
      avatar: { photoIndex: -1, center: [left + TEXT.avatar / 2, 2.45, 0], width: TEXT.avatar, height: TEXT.avatar },
    };
    lastRight = left + blockW;
  }
  const fits =
    title.center[0] + TEXT.titleWidth / 2 + TEXT.gap <= exX - TEXT.exhibitionWidth / 2 &&
    lastRight + TEXT.endMargin <= V * times.wallEnd;
  return { wall: { title, exhibition, intro }, fits };
}

const label = (text: string, number: string, room: Room): Label => ({ text, number, at: [room.x0 + 1.5, 1.5, room.backZ + 0.01], dark: room.dark });

export function computeStrip(input: StripInput): Strip {
  const { sequence, aspects } = input;
  const n = aspects.length;
  if (n === 0) throw new Error('the strip needs at least one photo');
  const portraitIndex = clamp(Math.round(input.portraitIndex), 0, n - 1);
  const rnd = mulberry32(input.seed);
  const walk = sequence.segments.filter((s) => WALK_SEGMENTS.includes(s.id));
  const title = requireSegment(sequence, 'title');
  const exhibition = requireSegment(sequence, 'exhibition');
  const intro = sequence.segments.find((s) => s.id === 'intro') ?? null;
  const wallSegments = walk.filter((s) => ROOM_OF[s.id] === 'wall');
  const exDur = exhibition.end - exhibition.start;
  const times: WallTimes = {
    tTitle: title.start + 0.3 * (title.end - title.start),
    tPar: exhibition.start + 0.2 * exDur,
    tEx: exhibition.start + 0.55 * exDur,
    tIntro: intro ? (intro.start + intro.end) / 2 : null,
    wallEnd: wallSegments[wallSegments.length - 1].end,
  };

  let V: number = LINE.baseSpeed;
  let texts = wallTexts(V, times);
  for (let i = 0; i < 200 && !texts.fits; i++) texts = wallTexts((V *= 1.02), times);
  if (texts.wall.intro) texts.wall.intro.avatar.photoIndex = portraitIndex;

  const rooms: Room[] = [];
  for (const segment of walk) {
    const id = ROOM_OF[segment.id]!;
    const last = rooms[rooms.length - 1];
    if (last && last.id === id) last.x1 = V * segment.end;
    else rooms.push({ id, x0: V * segment.start, x1: V * segment.end, backZ: BACK_Z[id], dark: DARK[id], height: id === 'robots' ? 10 : 6 });
  }
  const robotsRoom = rooms[rooms.length - 1];
  if (robotsRoom.id !== 'robots') throw new Error('the walk must end in the robot room');
  const walkEnd = walk[walk.length - 1].end;
  robotsRoom.x1 = V * walkEnd + ROBOTS.extend;

  const boundaries: Boundary[] = rooms.slice(1).map((right, i) => ({ x: right.x0, left: rooms[i], right, low: rooms[i].id === 'words' }));
  const obstacles: Box[] = [];
  for (const b of boundaries) {
    const depth = b.low ? BOUNDARY.lowDepth : BOUNDARY.depth;
    const h = Math.max(b.left.height, b.right.height);
    obstacles.push({ name: 'partition', min: [b.x - BOUNDARY.partition / 2, 0, Math.min(b.left.backZ, b.right.backZ)], max: [b.x + BOUNDARY.partition / 2, h, depth] });
    if (!b.low) {
      obstacles.push({
        name: 'pillar',
        min: [b.x - BOUNDARY.pillarWidth / 2, 0, BOUNDARY.pillarZ - BOUNDARY.pillarDepth / 2],
        max: [b.x + BOUNDARY.pillarWidth / 2, h, BOUNDARY.pillarZ + BOUNDARY.pillarDepth / 2],
      });
    }
  }

  const room = (id: RoomId) => rooms.find((r) => r.id === id) ?? null;
  let sectionNo = 0;
  let likesNo = 0;

  let portraits: Strip['portraits'] = null;
  const pr = room('portraits');
  if (pr) {
    const len = pr.x1 - pr.x0;
    const xa = pr.x0 + 0.15 * len;
    const xb = pr.x1 - 0.1 * len;
    const k = Math.min(12, n, Math.max(1, Math.floor((xb - xa) / 1.6) + 1));
    const indices = pickSpread(n, k);
    const mid = (xa + xb) / 2;
    portraits = {
      label: label('Portraits', String(++sectionNo), pr),
      items: indices.map((photoIndex, i) => ({ photoIndex, center: [indices.length === 1 ? mid : lerp(xa, xb, i / (indices.length - 1)), 1.7, 0], width: 1, height: 1 })),
      visitors: [spot([mid - 0.8, 0, 2.7], 0, rnd), spot([mid + 0.9, 0, 3.0], 1, rnd)],
    };
  }

  const ph = room('photos')!;
  const phLen = ph.x1 - ph.x0;
  const swarmA = ph.x0 + 3;
  const swarmB = Math.max(swarmA + 4, ph.x1 - 1.5);
  const photos: Strip['photos'] = {
    label: label('Photos', String(++sectionNo), ph),
    items: photoSwarm(aspects, swarmA, swarmB, rnd),
    visitors: [
      spot([lerp(swarmA, swarmB, 0.28), 0, 2.4], 0, rnd),
      spot([lerp(swarmA, swarmB, 0.55), 0, 3.3], 2, rnd),
      spot([lerp(swarmA, swarmB, 0.82), 0, 2.8], 1, rnd),
      // Stands right in front of the lens, so parallax sweeps it across the frame (original, 44 s).
      spot([ph.x0 + 0.42 * phLen, 0, 5.9], 0, rnd),
    ],
  };

  let moments: Strip['moments'] = null;
  const mo = room('moments');
  if (mo) {
    const len = mo.x1 - mo.x0;
    const fit = Math.max(1, Math.floor((len - 4.5) / 1.8) + 1);
    const count = Math.min(6, fit, Math.max(4, n));
    const indices = count <= n ? pickSpread(n, count, 0.37) : Array.from({ length: count }, (_, i) => i % n);
    const xa = mo.x0 + 2.5;
    const xb = Math.max(xa, mo.x1 - 2);
    const boxes = indices.map((photoIndex, i): CanvasItem => ({
      photoIndex, center: [indices.length === 1 ? (xa + xb) / 2 : lerp(xa, xb, i / (indices.length - 1)), 1.9, 0], width: 1.3, height: 2.8,
    }));
    moments = {
      label: label('Moments', String(++sectionNo), mo),
      boxes,
      visitors: [spot([boxes[0].center[0] + 1.4, 0, 2.8], 2, rnd, true), spot([boxes[boxes.length - 1].center[0] - 1.8, 0, 3.2], 0, rnd, true)],
    };
  }

  let words: Strip['words'] = null;
  const wo = room('words');
  if (wo) {
    const mid = (wo.x0 + wo.x1) / 2;
    words = {
      label: label('Words', String(++sectionNo), wo),
      wall: { center: [mid, 2.9, wo.backZ + 0.01], width: clamp(wo.x1 - wo.x0 - 4, 4, 28), height: 5 },
      visitors: [spot([mid - 3, 0, -2.2], 0, rnd, true), spot([mid + 4, 0, -2.6], 1, rnd, true)],
    };
  }

  let likes: Strip['likes'] = null;
  const li = room('likes');
  if (li) {
    const len = li.x1 - li.x0;
    const mid = (li.x0 + li.x1) / 2;
    likesNo = ++sectionNo;
    const monitors: Monitor[] = [];
    const cols = Math.max(1, Math.min(7, Math.floor((len * 0.55 - 1.2) / 1.12)));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 4; r++) {
        monitors.push({ center: [li.x0 + 1.7 + c * 1.12, 1.21 + r * 0.76, 0.05], normal: [0, 0, 1], width: 1, height: 0.62, bars: (c + r) % 4 === 1, photoIndex: (c * 4 + r) % n });
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = mid + 2.5 + i * 1.4;
      if (x > li.x1 - 1) break;
      monitors.push({ center: [x, 1.25, 0.9], normal: [0, 0, 1], width: 0.9, height: 0.56, bars: i % 3 === 1, photoIndex: (i * 7 + 3) % n });
    }
    likes = {
      label: label('Likes', String(likesNo), li),
      sculpture: [mid, 0, 3.2],
      monitors,
      visitors: [spot([li.x0 + 2.5, 0, 2.2], 1, rnd, true), spot([mid + 3, 0, 1.6], 0, rnd, true)],
    };
  }

  let videos: Strip['videos'] = null;
  const vi = room('videos');
  if (vi) {
    const len = vi.x1 - vi.x0;
    const mid = (vi.x0 + vi.x1) / 2;
    const s = Math.min(1, (len - 3) / 8.18);
    const pw = 2 * s;
    const ph2 = 1.2 * s;
    const gap = 0.06 * s;
    const panels = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        panels.push({ col, row, center: [mid + (col - 1.5) * (pw + gap), 2.5 + (1 - row) * (ph2 + gap), 0.01] as Vec3, width: pw, height: ph2 });
      }
    }
    const monitors: Monitor[] = [];
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 4; r++) {
        monitors.push({ center: [vi.x1 - BOUNDARY.partition / 2 - 0.02, 1.2 + r * 0.7, 0.7 + c * 0.78], normal: [-1, 0, 0], width: 0.7, height: 0.5, bars: false, photoIndex: (c * 4 + r + 5) % n });
      }
    }
    videos = {
      label: label('Videos', likesNo ? `${likesNo}.2` : String(++sectionNo), vi),
      photoIndex: pickSpread(n, 1, 0.61)[0],
      panels,
      monitors,
      visitors: [spot([mid - 1, 0, 3.2], 0, rnd, true), spot([mid + 0.4, 0, 3.0], 2, rnd, true)],
    };
  }

  const endX = V * walkEnd;
  const p = ROBOTS.platform;
  const platformCenter: Vec3 = [endX - ROBOTS.lead, p.height / 2, ROBOTS.platformZ];
  // The last arm stands left of the dive so the camera brushes past it (original, 152 s).
  const armSpots = [[-6.2, 0.6, 0], [6.2, 0.2, 1.7], [-2.6, -4.2, 3.1], [3.0, -4.0, 4.6], [-6.0, 3.0, 2.3]] as const;
  const arms = armSpots.map(([dx, dz, phase]) => ({
    pos: [platformCenter[0] + dx, 0, platformCenter[2] + dz] as Vec3,
    yaw: Math.atan2(-dx, -dz),
    phase,
  }));
  for (const arm of arms) {
    const reach: Vec3 = [arm.pos[0] + Math.sin(arm.yaw) * 2.4, 0, arm.pos[2] + Math.cos(arm.yaw) * 2.4];
    obstacles.push({
      name: 'arm',
      min: [Math.min(arm.pos[0], reach[0]) - 0.7, 0, Math.min(arm.pos[2], reach[2]) - 0.7],
      max: [Math.max(arm.pos[0], reach[0]) + 0.7, 3.1, Math.max(arm.pos[2], reach[2]) + 0.7],
    });
  }
  obstacles.push({
    name: 'platform',
    min: [platformCenter[0] - p.width / 2, 0, platformCenter[2] - p.depth / 2],
    max: [platformCenter[0] + p.width / 2, p.height, platformCenter[2] + p.depth / 2],
  });
  if (likes) obstacles.push({ name: 'sculpture', min: [likes.sculpture[0] - 1.9, 0, likes.sculpture[2] - 1.9], max: [likes.sculpture[0] + 1.9, 4, likes.sculpture[2] + 1.9] });

  const floaters = Array.from({ length: ROBOTS.floaters }, () => ({
    photoIndex: Math.floor(rnd() * n),
    pos: [lerp(robotsRoom.x0 + 2, endX + 10, rnd()), lerp(1.2, 5.5, rnd()), lerp(-9.5, -3.5, rnd())] as Vec3,
    size: lerp(0.16, 0.34, rnd()),
    phase: rnd() * Math.PI * 2,
  }));

  const carpet: Vec3 = [platformCenter[0], p.height + 0.006, platformCenter[2]];
  const featured = [
    ...new Set([
      portraitIndex,
      ...(portraits?.items.map((i) => i.photoIndex) ?? []),
      ...(moments?.boxes.map((b) => b.photoIndex) ?? []),
      ...(videos ? [videos.photoIndex] : []),
    ]),
  ];

  return {
    speed: V,
    walkEnd,
    tTitle: times.tTitle,
    tPar: times.tPar,
    tEx: times.tEx,
    rooms,
    boundaries,
    obstacles,
    wall: texts.wall,
    portraits,
    photos,
    moments,
    words,
    likes,
    videos,
    robots: { platform: { center: platformCenter, width: p.width, depth: p.depth, height: p.height }, arms, floaters },
    finale: {
      carpet,
      lifted: [carpet[0], ROBOTS.liftY, carpet[2]],
      network: networkLayout(n, portraitIndex, rnd),
      card: [carpet[0], -200, carpet[2]],
    },
    featured,
    portraitIndex,
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/strip.test.ts && npx tsc --noEmit`
Expected: PASS（10 passed）。若「wall texts never overlap」在某些組合失敗，只調整 `wallTexts` 的放置規則，不得放寬測試。

- [ ] **Step 5: 提交**

```bash
git add src/stage/placement.ts src/stage/strip.ts tests/unit/strip.test.ts
git commit -m "feat(v3): the gallery strip — rooms side by side along x with boundaries, exhibits and obstacles"
```

---

### Task 6: 連續鏡頭路徑 `camera/spline.ts`、`camera/path.ts`

**Files:**
- Create: `src/camera/spline.ts`, `src/camera/path.ts`
- Test: `tests/unit/path.test.ts`

**Interfaces:**
- Consumes: `Strip`, `LINE`, `PUSH`, `yawAt`, `roomAtX`（Task 5）；`findSegment`, `requireSegment`, `localU`（Task 4）
- Produces: `interface SplineKey { t; value: Vec3; velocity?: Vec3 }`、`createSpline(keys): { at(t): Vec3 }`；`interface PathPose { pos; target; fov; focus }`、`interface CameraPath { duration; poseAt(t) }`、`lineZ(sequence, t)`、`buildCameraPath(sequence, strip)`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/path.test.ts`**

```ts
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
```

Run: `npx vitest run tests/unit/path.test.ts`
Expected: FAIL（找不到 `src/camera/path`）

- [ ] **Step 2: 實作 `src/camera/spline.ts`**

```ts
import type { Vec3 } from '../types';

export interface SplineKey {
  t: number;
  value: Vec3;
  /** Explicit derivative at this key; otherwise Catmull-Rom (interior) or zero (ends). */
  velocity?: Vec3;
}

export interface Spline {
  readonly start: number;
  readonly end: number;
  at(t: number): Vec3;
}

export function createSpline(keys: SplineKey[]): Spline {
  if (keys.length < 2) throw new Error('a spline needs at least two keys');
  for (let i = 1; i < keys.length; i++) if (!(keys[i].t > keys[i - 1].t)) throw new Error(`spline key times must increase (index ${i})`);
  const tangents: Vec3[] = keys.map((k, i) => {
    if (k.velocity) return k.velocity;
    if (i === 0 || i === keys.length - 1) return [0, 0, 0];
    const p = keys[i - 1];
    const n = keys[i + 1];
    const dt = n.t - p.t;
    return [(n.value[0] - p.value[0]) / dt, (n.value[1] - p.value[1]) / dt, (n.value[2] - p.value[2]) / dt];
  });
  const first = keys[0].t;
  const last = keys[keys.length - 1].t;
  return {
    start: first,
    end: last,
    at(t) {
      const tc = Math.min(last, Math.max(first, t));
      let lo = 0;
      let hi = keys.length - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (keys[mid].t <= tc) lo = mid;
        else hi = mid - 1;
      }
      const a = keys[lo];
      const b = keys[lo + 1];
      const h = b.t - a.t;
      const u = (tc - a.t) / h;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const m0 = tangents[lo];
      const m1 = tangents[lo + 1];
      const at = (j: 0 | 1 | 2) => h00 * a.value[j] + h10 * h * m0[j] + h01 * b.value[j] + h11 * h * m1[j];
      return [at(0), at(1), at(2)];
    },
  };
}
```

- [ ] **Step 3: 實作 `src/camera/path.ts`**

```ts
import { findSegment, localU, requireSegment } from '../plan/sequence';
import { LINE, PUSH, roomAtX, yawAt, type Strip } from '../stage/strip';
import type { Sequence, Vec3 } from '../types';
import { smoothstep } from '../util/math';
import { createSpline, type SplineKey } from './spline';

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

/** Depth of the walking line: the Words push-in, then the pull-back in the following segment. */
export function lineZ(sequence: Sequence, t: number): number {
  const words = findSegment(sequence, 'words');
  if (!words) return LINE.z;
  if (t <= words.end) return LINE.z - (LINE.z - PUSH.z) * smoothstep(PUSH.start, PUSH.end, localU(words, t));
  const next = sequence.segments[sequence.segments.indexOf(words) + 1];
  return PUSH.z + (LINE.z - PUSH.z) * smoothstep(0, PUSH.pullBack, localU(next, t));
}

const sub = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function buildCameraPath(sequence: Sequence, strip: Strip): CameraPath {
  const V = strip.speed;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const P = strip.robots.platform.center;
  const C = strip.finale.lifted;
  const d = dive.end - dive.start;
  const x0 = V * dive.start;
  const z0 = lineZ(sequence, dive.start);

  const posKeys: SplineKey[] = [
    { t: dive.start, value: [x0, LINE.eye, z0], velocity: [V, 0, 0] },
    { t: dive.start + 0.35 * d, value: [P[0] - 2.6, 1.35, P[2] + 3.8] },
    { t: dive.start + 0.7 * d, value: [P[0] - 0.6, 0.95, P[2] + 1.6] },
    { t: dive.end, value: [P[0], 4.2, P[2] + 1.2] },
    { t: mosaic.end, value: [C[0], 9.5, C[2] + 2.5] },
  ];
  const targetKeys: SplineKey[] = [
    { t: dive.start, value: [x0, LINE.lookY, z0 - 10], velocity: [V, 0, 0] },
    { t: dive.start + 0.35 * d, value: [P[0], 0.6, P[2]] },
    { t: dive.start + 0.7 * d, value: [P[0] + 3, 0.4, P[2] - 0.6] },
    { t: dive.end, value: [P[0], 0.4, P[2]] },
    { t: mosaic.end, value: C },
  ];
  if (network) {
    const n = network.end - network.start;
    posKeys.push({ t: network.start + 0.5 * n, value: [C[0] + 3, 20, C[2] + 8] }, { t: network.end, value: [C[0], 38, C[2] + 12] });
    targetKeys.push({ t: network.start + 0.5 * n, value: C }, { t: network.end, value: C });
  }
  const pos = createSpline(posKeys);
  const target = createSpline(targetKeys);
  const card = strip.finale.card;

  return {
    duration: sequence.total,
    poseAt(t) {
      if (t >= ending.start) {
        return { pos: [card[0], card[1], card[2] + 6.2], target: [card[0], card[1] - 0.2, card[2]], fov: 35, focus: 6.2 };
      }
      if (t < dive.start) {
        const x = V * t;
        const z = lineZ(sequence, t);
        const yaw = yawAt(strip, t);
        const room = roomAtX(strip, x);
        return {
          pos: [x, LINE.eye, z],
          target: [x + 10 * Math.sin(yaw), LINE.lookY, z - 10 * Math.cos(yaw)],
          fov: LINE.fov,
          focus: Math.max(1, (z - room.backZ) / Math.cos(yaw)),
        };
      }
      const p = pos.at(t);
      const q = target.at(t);
      return { pos: p, target: q, fov: 40, focus: Math.max(0.8, sub(p, q)) };
    },
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/path.test.ts && npx tsc --noEmit`
Expected: PASS（9 passed）。若「never enters an obstacle」失敗：只調整 `posKeys` 的 dive 關鍵點，或 strip 中的手臂位置 `armSpots`，不放寬 padding。

- [ ] **Step 5: 提交**

```bash
git add src/camera/spline.ts src/camera/path.ts tests/unit/path.test.ts
git commit -m "feat(v3): one continuous camera path — constant-speed walk, push-in, dive and pull-back"
```

---

### Task 7: 水泥地面貼圖

**Files:**
- Modify: `src/assets/texture-factory.ts`（`StageTextureFactory` 新增 `concrete(): Texture`）、`src/assets/text.ts`、`tests/unit/fake-stage.ts`（假工廠補上 `concrete`）、`tests/e2e/text.spec.ts`

**Interfaces:**
- Produces: `StageTextureFactory.concrete(): Texture`（1024² 可重複的水泥貼圖，`RepeatWrapping`）

- [ ] **Step 1: 寫失敗的測試**

在 `tests/e2e/text.spec.ts` 的 evaluate 回傳物件中加入 `concrete: (() => { const c = f.concrete(); return [c.image.width, c.wrapS]; })(),`，並在斷言區加入：
```ts
  expect(r.concrete).toEqual([1024, 1000]); // 1000 = THREE.RepeatWrapping
```

Run: `npx playwright test tests/e2e/text.spec.ts`
Expected: FAIL（`f.concrete is not a function`）

- [ ] **Step 2: 實作**

`src/assets/texture-factory.ts` 的 `StageTextureFactory` 介面內加入：
```ts
  /** Seamless grey concrete for gallery floors. */
  concrete(): Texture;
```

`src/assets/text.ts`：
- import 改為 `import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';`，並加上 `import { mulberry32 } from '../util/rng';`
- 在 `rasterizeLines` 之前加入：
```ts
function concrete(): Texture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = context2d(canvas);
  const rnd = mulberry32(0xc0ffee);
  ctx.fillStyle = '#a49f97';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 60 + rnd() * 220;
    const light = rnd() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(255, 252, 245, 0.06)' : 'rgba(40, 36, 30, 0.07)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    // Draw each blotch wrapped around the edges so the texture tiles without seams.
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.restore();
    }
  }
  for (let i = 0; i < 26000; i++) {
    const v = Math.floor(120 + rnd() * 100);
    ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 10}, ${0.08 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * size, rnd() * size, 0.5 + rnd() * 1.6, 0.5 + rnd() * 1.6);
  }
  const texture = toTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
```
- `createCanvasTextureFactory` 改為 `return { text, glow, lightbox, colorBars, concrete };`

`tests/unit/fake-stage.ts` 的 `fakeTextures` 回傳物件加入 `concrete: () => new Texture(),`

- [ ] **Step 3: 執行確認通過**

Run: `npx tsc --noEmit && npx vitest run && npx playwright test tests/e2e/text.spec.ts`
Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add src/assets tests/unit/fake-stage.ts tests/e2e/text.spec.ts
git commit -m "feat(v3): seamless concrete floor texture"
```

---
### Task 8: 展廳外殼與白房（白牆、Portraits、Photos）

**Files:**
- Modify: `src/stage/parts/materials.ts`（顏色與兩種隔柱材質）
- Create: `src/stage/world/context.ts`, `src/stage/world/common.ts`, `src/stage/world/shell.ts`, `src/stage/world/rooms/wall.ts`, `src/stage/world/rooms/portraits.ts`, `src/stage/world/rooms/photos.ts`, `tests/unit/fake-world.ts`
- Test: `tests/unit/world-rooms.test.ts`

**Interfaces:**
- Consumes: Task 5 `Strip`, `BOUNDARY`, `Label`；v2 零件 `createCanvasBlock`, `BLOCK_DEPTH`, `createTextPlane`, `createVisitor`, `buildAtlasInstances`, `StageMaterials`；`PhotoLibrary`；`StageTextureFactory`（含 Task 7 的 `concrete`）
- Produces:
  - `StageMaterials` 新增 `pillarDark`、`pillarLight`；`wall` 改為 `#d9d8d4`，`darkWall` 改為 `#161616`，`darkFloor` 改為 `#101010`
  - `world/context.ts`：`WorldContent`（欄位同 v2 `StageContent`）、`WorldContext { sequence; strip; content; tex; mats }`、`RoomObject { group; update? }`、`hiresOf(content, index)`
  - `world/common.ts`：`INK = '#141414'`、`createLabel(tex, label, mats): Group`、`addVisitors(group, spots, mats)`
  - `buildShell(ctx): Group`、`buildWallRoom(ctx)`、`buildPortraitsRoom(ctx): RoomObject | null`、`buildPhotosRoom(ctx)`
  - 物件名稱：`'back-wall'`、`'floor'`、`'partition'`、`'pillar'`、`'end-wall'`、`'title'`、`'exhibition'`、`'intro'`、`'intro-avatar'`、`'portrait-block'`、`'photo-swarm'`、`'visitor'`、`'label:<名稱>'`

- [ ] **Step 1: 更新材質 `src/stage/parts/materials.ts`**

- 介面中 `pedestal: MeshStandardMaterial;` 之後加入 `pillarDark: MeshStandardMaterial;` 與 `pillarLight: MeshStandardMaterial;`
- `shared` 物件中：`wall: std(0xe9e8e4, 0.95),` 改為 `wall: std(0xd9d8d4, 0.95),`；`darkFloor: std(0x0b0b0c, 0.35, { metalness: 0.2 }),` 改為 `darkFloor: std(0x101010, 0.4, { metalness: 0.15 }),`；`darkWall: std(0x070707, 1),` 改為 `darkWall: std(0x161616, 1),`；並在 `pedestal: …` 之後加入 `pillarDark: std(0x1a1a1a, 0.9),` 與 `pillarLight: std(0xc4c3bf, 0.9),`

- [ ] **Step 2: 測試用的假資料 `tests/unit/fake-world.ts`**

```ts
import { Texture } from 'three';
import type { StageTextureFactory } from '../../src/assets/texture-factory';
import { buildSequence } from '../../src/plan/sequence';
import { createStageMaterials } from '../../src/stage/parts/materials';
import { CARPET, computeStrip } from '../../src/stage/strip';
import type { WorldContent, WorldContext } from '../../src/stage/world/context';
import type { LengthMode } from '../../src/types';
import { fakeLibrary } from './fake-library';

export function fakeWorldTextures(aspect = 4): StageTextureFactory {
  return {
    text: () => ({ texture: new Texture(), aspect }),
    glow: () => new Texture(),
    lightbox: () => new Texture(),
    colorBars: () => new Texture(),
    concrete: () => new Texture(),
  };
}

export function fakeWorldContext(n = 12, lengthMode: LengthMode = 'auto', opts: { textAspect?: number; hires?: boolean } = {}): WorldContext {
  const aspects = Array.from({ length: n }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const sequence = buildSequence({ photoCount: n, lengthMode, musicDuration: null });
  const strip = computeStrip({ sequence, aspects, portraitIndex: 1 % n, seed: 3 });
  const library = fakeLibrary(n, aspects, opts.hires === false ? [] : strip.featured);
  const cells = CARPET.cols * CARPET.rows;
  const content: WorldContent = {
    library,
    name: 'Tim Sparke',
    subtitle: '2026',
    stamp: '08:06:55 AM Monday November 28, 2011',
    dateLabel: '2011.11.28',
    captions: aspects.map((_, i) => `caption ${i}`),
    led: { main: new Texture(), highlight: new Texture() },
    mosaic: { colors: new Float32Array(cells * 3).fill(0.5), assignment: new Int32Array(cells).map((_, i) => (i * 7) % n) },
  };
  return { sequence, strip, content, tex: fakeWorldTextures(opts.textAspect), mats: createStageMaterials() };
}
```

- [ ] **Step 3: 寫失敗的測試 `tests/unit/world-rooms.test.ts`**

```ts
import { InstancedMesh, Mesh, PlaneGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildPhotosRoom } from '../../src/stage/world/rooms/photos';
import { buildPortraitsRoom } from '../../src/stage/world/rooms/portraits';
import { buildWallRoom } from '../../src/stage/world/rooms/wall';
import { buildShell } from '../../src/stage/world/shell';
import { fakeWorldContext } from './fake-world';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('shell', () => {
  it('builds a back wall and floor per room, a partition per boundary and a pillar where the camera passes', () => {
    const ctx = fakeWorldContext(20);
    const shell = buildShell(ctx);
    expect(named(shell, 'back-wall')).toHaveLength(ctx.strip.rooms.length);
    expect(named(shell, 'floor')).toHaveLength(ctx.strip.rooms.length);
    expect(named(shell, 'partition')).toHaveLength(ctx.strip.boundaries.length);
    expect(named(shell, 'pillar')).toHaveLength(ctx.strip.boundaries.filter((b) => !b.low).length);
    expect(named(shell, 'end-wall')).toHaveLength(1);
  });

  it('partitions show each room its own wall colour', () => {
    const ctx = fakeWorldContext(20);
    const shell = buildShell(ctx);
    const b = ctx.strip.boundaries.find((x) => !x.left.dark && x.right.dark)!;
    const partition = (named(shell, 'partition') as Mesh[]).find((m) => Math.abs(m.position.x - b.x) < 1e-9)!;
    const materials = partition.material as unknown[];
    expect(materials[0]).toBe(ctx.mats.darkWall);
    expect(materials[1]).toBe(ctx.mats.wall);
  });
});

describe('white rooms', () => {
  it('the wall room hangs title, exhibition and intro in order along x', () => {
    const ctx = fakeWorldContext(20);
    const room = buildWallRoom(ctx);
    const [title] = named(room.group, 'title');
    const [exhibition] = named(room.group, 'exhibition');
    const [intro] = named(room.group, 'intro');
    expect(title.position.x).toBeLessThan(exhibition.position.x);
    expect(exhibition.position.x).toBeLessThan(intro.position.x);
    expect(exhibition.position.x).toBeCloseTo(ctx.strip.wall.exhibition.center[0], 9);
    expect(named(room.group, 'intro-avatar')).toHaveLength(1);
  });

  it('a long name still fits the exhibition box', () => {
    const ctx = fakeWorldContext(10, 'auto', { textAspect: 30 });
    const [exhibition] = named(buildWallRoom(ctx).group, 'exhibition') as Mesh[];
    expect((exhibition.geometry as PlaneGeometry).parameters.width).toBeLessThanOrEqual(ctx.strip.wall.exhibition.width + 1e-9);
  });

  it('portraits and photos rooms hang every exhibit with their label and visitors', () => {
    const ctx = fakeWorldContext(30);
    const portraits = buildPortraitsRoom(ctx)!;
    expect(named(portraits.group, 'portrait-block')).toHaveLength(ctx.strip.portraits!.items.length);
    expect(named(portraits.group, 'label:Portraits')).toHaveLength(1);
    const photos = buildPhotosRoom(ctx);
    const swarm = named(photos.group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.reduce((s, m) => s + m.count, 0)).toBe(30);
    expect(named(photos.group, 'visitor')).toHaveLength(ctx.strip.photos.visitors.length);
    expect(named(photos.group, 'label:Photos')).toHaveLength(1);
  });

  it('the photo swarm spreads more than 256 photos over two atlas meshes', () => {
    const swarm = named(buildPhotosRoom(fakeWorldContext(300)).group, 'photo-swarm') as InstancedMesh[];
    expect(swarm.map((m) => m.count)).toEqual([256, 44]);
  });

  it('the 30 s cut has no portraits room', () => {
    expect(buildPortraitsRoom(fakeWorldContext(12, 30))).toBeNull();
  });
});
```

Run: `npx vitest run tests/unit/world-rooms.test.ts`
Expected: FAIL（找不到 `src/stage/world/*`）

- [ ] **Step 4: 實作 context、common、shell**

`src/stage/world/context.ts`:
```ts
import type { Group, Texture } from 'three';
import type { PhotoLibrary } from '../../assets/library';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { Sequence } from '../../types';
import type { StageMaterials } from '../parts/materials';
import type { Strip } from '../strip';

export interface WorldContent {
  library: PhotoLibrary;
  name: string;
  subtitle: string;
  /** e.g. "08:06:55 AM Monday November 28, 2011" */
  stamp: string;
  /** e.g. "2026.09.28"; empty when no date was chosen. */
  dateLabel: string;
  captions: string[];
  led: { main: Texture; highlight: Texture };
  /** Portrait colour per carpet cell (flat rgb, row 0 at the far edge) and the photo chosen for each cell. */
  mosaic: { colors: Float32Array; assignment: Int32Array };
}

export interface WorldContext {
  sequence: Sequence;
  strip: Strip;
  content: WorldContent;
  tex: StageTextureFactory;
  mats: StageMaterials;
}

export interface RoomObject {
  group: Group;
  update?: (t: number) => void;
}

export function hiresOf(content: WorldContent, index: number): Texture {
  const texture = content.library.hires.get(index);
  if (!texture) throw new Error(`photo ${index} is featured but has no high-resolution texture`);
  return texture;
}
```

`src/stage/world/common.ts`:
```ts
import { BoxGeometry, Group, Mesh } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import type { VisitorSpot } from '../placement';
import type { StageMaterials } from '../parts/materials';
import { createTextPlane } from '../parts/text-plane';
import { createVisitor } from '../parts/visitor';
import type { Label } from '../strip';

/** Wall lettering: solid near-black, as printed vinyl in the original. */
export const INK = '#141414';

const BLURBS: Record<string, string> = {
  Portraits: 'The faces in this collection.',
  Photos: 'Moments worth keeping.',
  Moments: 'Where and when.',
  Words: 'The words you use most.',
  Likes: 'Things you love.',
  Videos: 'Moving pictures.',
};

/** Section label: icon, name, one line of description and the section number (dark rooms use white lettering). */
export function createLabel(tex: StageTextureFactory, label: Label, mats: StageMaterials): Group {
  const group = new Group();
  group.name = `label:${label.text}`;
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
    0.42,
    0.52,
  );
  if (!label.dark) {
    const backing = new Mesh(new BoxGeometry(0.46, 0.56, 0.015), mats.plaque);
    backing.position.z = 0.0075;
    group.add(backing);
  }
  text.position.z = 0.016;
  group.add(text);
  group.position.set(...label.at);
  return group;
}

export function addVisitors(group: Group, spots: VisitorSpot[], mats: StageMaterials): void {
  for (const s of spots) group.add(createVisitor(s, mats.visitor));
}
```

`src/stage/world/shell.ts`:
```ts
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Material } from 'three';
import { BOUNDARY } from '../strip';
import type { WorldContext } from './context';

const FRONT = 18;

/** Back walls, floors, partitions (each face in its own room's colour), pillars and the far end wall. */
export function buildShell(ctx: WorldContext): Group {
  const { strip, mats, tex } = ctx;
  const group = new Group();
  group.name = 'shell';
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
  const add = (mesh: Mesh, name: string) => {
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  strip.rooms.forEach((room, i) => {
    const left = i === 0 ? room.x0 - 10 : room.x0 - BOUNDARY.partition / 2;
    const right = room.x1 + BOUNDARY.partition / 2;
    const width = right - left;
    const cx = (left + right) / 2;
    const back = add(new Mesh(new PlaneGeometry(width, room.height), room.dark ? mats.darkWall : mats.wall), 'back-wall');
    back.position.set(cx, room.height / 2, room.backZ);
    const depth = FRONT - room.backZ;
    const floor = add(new Mesh(new PlaneGeometry(width, depth), room.dark ? mats.darkFloor : concreteFloor(width, depth)), 'floor');
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, room.backZ + depth / 2);
  });

  for (const b of strip.boundaries) {
    const depth = b.low ? BOUNDARY.lowDepth : BOUNDARY.depth;
    const back = Math.min(b.left.backZ, b.right.backZ);
    const h = Math.max(b.left.height, b.right.height);
    const dark = b.left.dark || b.right.dark;
    const edge = dark ? mats.darkWall : mats.wall;
    // BoxGeometry groups: +x, −x, +y, −y, +z, −z. +x faces the right room, −x the left room.
    const partition = add(
      new Mesh(new BoxGeometry(BOUNDARY.partition, h, depth - back), [
        b.right.dark ? mats.darkWall : mats.wall,
        b.left.dark ? mats.darkWall : mats.wall,
        edge, edge, edge, edge,
      ]),
      'partition',
    );
    partition.position.set(b.x, h / 2, back + (depth - back) / 2);
    if (!b.low) {
      const pillar = add(new Mesh(new BoxGeometry(BOUNDARY.pillarWidth, h, BOUNDARY.pillarDepth), dark ? mats.pillarDark : mats.pillarLight), 'pillar');
      pillar.position.set(b.x, h / 2, BOUNDARY.pillarZ);
    }
  }

  const last = strip.rooms[strip.rooms.length - 1];
  const len = FRONT - last.backZ;
  const end = add(new Mesh(new PlaneGeometry(len, last.height), mats.wall), 'end-wall');
  end.rotation.y = -Math.PI / 2;
  end.position.set(last.x1, last.height / 2, last.backZ + len / 2);
  return group;
}
```

- [ ] **Step 5: 實作三個白房**

`src/stage/world/rooms/wall.ts`:
```ts
import { Group } from 'three';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { createTextPlane } from '../../parts/text-plane';
import { INK } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

export function buildWallRoom(ctx: WorldContext): RoomObject {
  const { strip, content, tex, mats } = ctx;
  const w = strip.wall;
  const group = new Group();
  group.name = 'room:wall';

  const title = createTextPlane(
    tex.text({
      color: INK,
      lineGap: 0.5,
      padding: 20,
      lines: [
        { text: 'The Museum of Me', px: 120, weight: 500, family: 'serif' },
        { text: 'Create and explore a visual archive of your social life.', px: 30, weight: 500, spacing: 1 },
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
          { text: 'This exhibition is a journey of', px: 64, weight: 500, family: 'serif' },
          { text: `visualization that explores who ${content.name} is.`, px: 64, weight: 500, family: 'serif' },
        ],
      }),
      w.intro.width,
      w.intro.height,
    );
    intro.name = 'intro';
    intro.position.set(w.intro.center[0], w.intro.center[1], 0.01);
    group.add(block, intro);
  }
  return { group };
}
```

`src/stage/world/rooms/portraits.ts`:
```ts
import { Group } from 'three';
import { BLOCK_DEPTH, createCanvasBlock } from '../../parts/canvas-block';
import { addVisitors, createLabel } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

export function buildPortraitsRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats } = ctx;
  const p = strip.portraits;
  if (!p) return null;
  const group = new Group();
  group.name = 'room:portraits';
  group.add(createLabel(tex, p.label, mats));
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

`src/stage/world/rooms/photos.ts`:
```ts
import { BoxGeometry, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { CanvasItem } from '../../placement';
import { buildAtlasInstances } from '../../parts/atlas-mesh';
import { BLOCK_DEPTH } from '../../parts/canvas-block';
import { addVisitors, createLabel } from '../common';
import type { RoomObject, WorldContext } from '../context';

export function buildPhotosRoom(ctx: WorldContext): RoomObject {
  const { strip, content, tex, mats } = ctx;
  const p = strip.photos;
  const group = new Group();
  group.name = 'room:photos';
  group.add(createLabel(tex, p.label, mats));
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

- [ ] **Step 6: 執行確認通過**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS（world-rooms 7 passed）

- [ ] **Step 7: 提交**

```bash
git add src/stage tests/unit/fake-world.ts tests/unit/world-rooms.test.ts
git commit -m "feat(v3): strip shell with two-tone partitions and pillars, and the white rooms"
```

---

### Task 9: 暗房（Moments、Words、Likes、Videos）

**Files:**
- Create: `src/stage/world/rooms/moments.ts`, `src/stage/world/rooms/words.ts`, `src/stage/world/rooms/likes.ts`, `src/stage/world/rooms/videos.ts`
- Test: `tests/unit/world-dark.test.ts`

**Interfaces:**
- Consumes: Task 8 的 context／common；v2 零件 `createThumbSculpture`、`cellTextureCropped`；`requireSegment`, `localU`（Task 4）
- Produces: `buildMomentsRoom`、`buildWordsRoom`、`buildLikesRoom`、`buildVideosRoom`（皆為 `(ctx) => RoomObject | null`）；`coverRect(aspect, target)`、`videoPanelRect(col, row, cols, rows, cover, zoom, pan)`；物件名稱 `'lightbox'`、`'led-main'`、`'led-highlight'`、`'thumb'`、`'screen'`、`'video-panel'`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/world-dark.test.ts`**

```ts
import { Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { requireSegment } from '../../src/plan/sequence';
import { buildLikesRoom } from '../../src/stage/world/rooms/likes';
import { buildMomentsRoom } from '../../src/stage/world/rooms/moments';
import { buildVideosRoom, coverRect, videoPanelRect } from '../../src/stage/world/rooms/videos';
import { buildWordsRoom } from '../../src/stage/world/rooms/words';
import { fakeWorldContext } from './fake-world';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const opacity = (o: Object3D) => ((o as Mesh).material as MeshBasicMaterial).opacity;

describe('dark rooms', () => {
  it('moments: one glowing light box per box in the strip', () => {
    const ctx = fakeWorldContext(3);
    const room = buildMomentsRoom(ctx)!;
    expect(named(room.group, 'lightbox')).toHaveLength(ctx.strip.moments!.boxes.length);
    expect(ctx.strip.moments!.boxes.length).toBeGreaterThanOrEqual(4);
    expect(named(room.group, 'label:Moments')).toHaveLength(1);
  });

  it('words: the highlight word fills the wall around 52–72 % of the segment', () => {
    const ctx = fakeWorldContext(20);
    const room = buildWordsRoom(ctx)!;
    const words = requireSegment(ctx.sequence, 'words');
    const at = (u: number) => words.start + u * (words.end - words.start);
    const [main] = named(room.group, 'led-main');
    const [highlight] = named(room.group, 'led-highlight');
    room.update!(at(0.3));
    expect(opacity(highlight)).toBe(0);
    expect(opacity(main)).toBe(1);
    room.update!(at(0.62));
    expect(opacity(highlight)).toBe(1);
    room.update!(at(0.9));
    expect(opacity(highlight)).toBe(0);
    expect(main.position.z).toBeCloseTo(ctx.strip.words!.wall.center[2] + 0.01, 9);
  });

  it('likes: sculpture on its pedestal, back-wall screens with some colour bars, stand monitors', () => {
    const ctx = fakeWorldContext(20);
    const room = buildLikesRoom(ctx)!;
    expect(named(room.group, 'thumb')).toHaveLength(1);
    const screens = named(room.group, 'screen') as Mesh[];
    expect(screens).toHaveLength(ctx.strip.likes!.monitors.length);
    const bars = screens.filter((_, i) => ctx.strip.likes!.monitors[i].bars);
    expect(bars.length).toBeGreaterThan(0);
    expect(new Set(bars.map((s) => s.material)).size).toBe(1);
  });

  it('videos: 12 panels panning across one photo plus the side-wall screens', () => {
    const ctx = fakeWorldContext(20);
    const room = buildVideosRoom(ctx)!;
    const panels = named(room.group, 'video-panel') as Mesh<never, MeshBasicMaterial>[];
    expect(panels).toHaveLength(12);
    const seg = requireSegment(ctx.sequence, 'videos');
    room.update!(seg.start);
    const before = panels[0].material.map!.offset.x;
    room.update!(seg.end);
    expect(panels[0].material.map!.offset.x).not.toBe(before);
    expect(named(room.group, 'screen')).toHaveLength(ctx.strip.videos!.monitors.length);
    const side = (named(room.group, 'screen') as Mesh[])[0];
    expect(side.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('rooms missing from the cut are not built', () => {
    const ctx = fakeWorldContext(12, 30);
    expect(buildMomentsRoom(ctx)).toBeNull();
    expect(buildWordsRoom(ctx)).toBeNull();
    expect(buildLikesRoom(ctx)).toBeNull();
    expect(buildVideosRoom(ctx)).toBeNull();
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

Run: `npx vitest run tests/unit/world-dark.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 2: 實作四個暗房**

`src/stage/world/rooms/moments.ts`:
```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight } from 'three';
import type { ImageLike } from '../../../assets/texture-factory';
import { addVisitors, createLabel } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

export function buildMomentsRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats } = ctx;
  const m = strip.moments;
  if (!m) return null;
  const group = new Group();
  group.name = 'room:moments';
  group.add(createLabel(tex, m.label, mats));
  m.boxes.forEach((box, i) => {
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
  addVisitors(group, m.visitors, mats);
  return { group };
}
```

`src/stage/world/rooms/words.ts`:
```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';
import { localU, requireSegment } from '../../../plan/sequence';
import { smoothstep } from '../../../util/math';
import { addVisitors, createLabel } from '../common';
import type { RoomObject, WorldContext } from '../context';

export function buildWordsRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats, sequence } = ctx;
  const w = strip.words;
  if (!w) return null;
  const segment = requireSegment(sequence, 'words');
  const group = new Group();
  group.name = 'room:words';
  group.add(createLabel(tex, w.label, mats));
  const backing = new Mesh(new BoxGeometry(w.wall.width + 0.4, w.wall.height + 0.4, 0.2), mats.darkWall);
  backing.position.set(w.wall.center[0], w.wall.center[1], w.wall.center[2] - 0.1);
  const panel = (map: Texture, name: string, dz: number, opacity: number) => {
    const material = new MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false });
    material.color.setScalar(1.6);
    material.userData.owned = true;
    const mesh = new Mesh(new PlaneGeometry(w.wall.width, w.wall.height), material);
    mesh.name = name;
    mesh.position.set(w.wall.center[0], w.wall.center[1], w.wall.center[2] + dz);
    return mesh;
  };
  const main = panel(content.led.main, 'led-main', 0.01, 1);
  const highlight = panel(content.led.highlight, 'led-highlight', 0.012, 0);
  group.add(backing, main, highlight);
  addVisitors(group, w.visitors, mats);
  return {
    group,
    update(t) {
      const u = localU(segment, t);
      const h = smoothstep(0.5, 0.55, u) * (1 - smoothstep(0.7, 0.75, u));
      (highlight.material as MeshBasicMaterial).opacity = h;
      (main.material as MeshBasicMaterial).opacity = 1 - 0.85 * h;
    },
  };
}
```

`src/stage/world/rooms/likes.ts`:
```ts
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SpotLight } from 'three';
import { cellTextureCropped } from '../../parts/atlas-mesh';
import { createThumbSculpture } from '../../parts/thumb';
import { addVisitors, createLabel } from '../common';
import type { RoomObject, WorldContext } from '../context';

export function buildLikesRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats } = ctx;
  const l = strip.likes;
  if (!l) return null;
  const group = new Group();
  group.name = 'room:likes';
  group.add(createLabel(tex, l.label, mats));
  const [sx, , sz] = l.sculpture;
  const pedestal = new Mesh(new CylinderGeometry(1.7, 1.8, 0.55, 48), mats.pedestal);
  pedestal.position.set(sx, 0.275, sz);
  const thumb = createThumbSculpture(mats.sculpture, 7);
  thumb.position.set(sx, 0.55, sz);
  thumb.rotation.y = -0.35;
  const spot = new SpotLight(0xffffff, 160, 20, 0.5, 0.6, 1.5);
  spot.position.set(sx + 1.5, 9, sz + 3);
  spot.target.position.set(sx, 1.5, sz);
  group.add(pedestal, thumb, spot, spot.target);

  const barsMaterial = new MeshBasicMaterial({ map: tex.colorBars() });
  barsMaterial.color.setScalar(1.3);
  barsMaterial.userData.owned = true;
  barsMaterial.userData.ownsMap = true;
  for (const monitor of l.monitors) {
    const body = new Mesh(new BoxGeometry(monitor.width + 0.06, monitor.height + 0.06, 0.08), mats.monitorBody);
    body.position.set(monitor.center[0], monitor.center[1], monitor.center[2] - 0.03);
    let material = barsMaterial;
    if (!monitor.bars) {
      material = new MeshBasicMaterial({ map: cellTextureCropped(content.library, monitor.photoIndex, monitor.width / monitor.height) });
      material.color.setScalar(1.4);
      material.userData.owned = true;
      material.userData.ownsMap = true;
    }
    const screen = new Mesh(new PlaneGeometry(monitor.width, monitor.height), material);
    screen.name = 'screen';
    screen.position.set(monitor.center[0], monitor.center[1], monitor.center[2] + 0.011);
    group.add(body, screen);
    if (monitor.center[2] > 0.5) {
      const pole = new Mesh(new CylinderGeometry(0.03, 0.03, monitor.center[1], 12), mats.monitorBody);
      pole.position.set(monitor.center[0], monitor.center[1] / 2, monitor.center[2] - 0.05);
      group.add(pole);
    }
  }
  addVisitors(group, l.visitors, mats);
  return { group };
}
```

`src/stage/world/rooms/videos.ts`:
```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { UvRect } from '../../../assets/atlas';
import { localU, requireSegment } from '../../../plan/sequence';
import { clamp, lerp } from '../../../util/math';
import { cellTextureCropped } from '../../parts/atlas-mesh';
import { addVisitors, createLabel } from '../common';
import { hiresOf, type RoomObject, type WorldContext } from '../context';

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

export function buildVideosRoom(ctx: WorldContext): RoomObject | null {
  const { strip, content, tex, mats, sequence } = ctx;
  const v = strip.videos;
  if (!v) return null;
  const segment = requireSegment(sequence, 'videos');
  const group = new Group();
  group.name = 'room:videos';
  group.add(createLabel(tex, v.label, mats));

  const xs = v.panels.map((p) => p.center[0]);
  const ys = v.panels.map((p) => p.center[1]);
  const pw = v.panels[0].width;
  const ph = v.panels[0].height;
  const wallW = Math.max(...xs) - Math.min(...xs) + pw;
  const wallH = Math.max(...ys) - Math.min(...ys) + ph;
  const backing = new Mesh(new BoxGeometry(wallW + 0.3, wallH + 0.3, 0.12), mats.darkWall);
  backing.position.set((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, -0.05);
  group.add(backing);

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
    mesh.position.set(...p.center);
    group.add(mesh);
    return { panel: p, material };
  });

  for (const monitor of v.monitors) {
    const material = new MeshBasicMaterial({ map: cellTextureCropped(content.library, monitor.photoIndex, monitor.width / monitor.height) });
    material.color.setScalar(1.3);
    material.userData.owned = true;
    material.userData.ownsMap = true;
    const screen = new Mesh(new PlaneGeometry(monitor.width, monitor.height), material);
    screen.name = 'screen';
    screen.rotation.y = Math.atan2(monitor.normal[0], monitor.normal[2]);
    screen.position.set(...monitor.center);
    group.add(screen);
  }

  const update = (t: number) => {
    const u = localU(segment, t);
    const zoom = lerp(1, 1.12, u);
    const pan = lerp(-0.04, 0.04, u);
    for (const { panel, material } of panels) {
      const [ru, rv, rw, rh] = videoPanelRect(panel.col, panel.row, 4, 3, cover, zoom, pan);
      material.map!.offset.set(ru, rv);
      material.map!.repeat.set(rw, rh);
    }
  };
  update(segment.start);
  addVisitors(group, v.visitors, mats);
  return { group, update };
}
```

- [ ] **Step 3: 執行確認通過**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS（world-dark 7 passed）

- [ ] **Step 4: 提交**

```bash
git add src/stage/world/rooms tests/unit/world-dark.test.ts
git commit -m "feat(v3): dark rooms on the strip — light boxes, LED wall, like sculpture, video wall"
```

---

### Task 10: 機器手臂房、地毯 → 馬賽克 → 網絡、片尾與場景組裝

**Files:**
- Create: `src/stage/world/rooms/robots.ts`, `src/stage/world/finale.ts`, `src/stage/world/world.ts`
- Test: `tests/unit/world-finale.test.ts`

**Interfaces:**
- Consumes: Task 8、9；v2 `armAngles`, `createRobotArm`, `buildAtlasInstances`, `createAtlasMaterial`, `cellTexture`, `cropTexture`, `disposeScene`（`stage/dispose.ts`）；`CARPET`；`requireSegment`, `findSegment`, `localU`
- Produces: `buildRobotsRoom(ctx): RoomObject`；`buildFinale(ctx): RoomObject & { blackoutAt(t): number }`；`interface World { scene; update(t); bloomAt(t, x): number; dispose() }`、`buildWorld(sequence, strip, content, tex): World`；物件名稱 `'robot-arm'`、`'gripper'`、`'floaters'`、`'carpet'`、`'carpet-tiles'`、`'mosaic-overlay'`、`'blackout'`、`'network'`、`'network-nodes'`、`'network-core'`、`'stars'`、`'end-card'`、`'tagline'`、`'rooms'`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/world-finale.test.ts`**

```ts
import { Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { findSegment, requireSegment } from '../../src/plan/sequence';
import { CARPET } from '../../src/stage/strip';
import { buildFinale } from '../../src/stage/world/finale';
import { buildRobotsRoom } from '../../src/stage/world/rooms/robots';
import { buildWorld } from '../../src/stage/world/world';
import { fakeWorldContext } from './fake-world';

const named = (root: Object3D, name: string) => { const out: Object3D[] = []; root.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
const count = (root: Object3D, name: string) => (named(root, name) as InstancedMesh[]).reduce((s, m) => s + m.count, 0);

describe('robots room', () => {
  it('has five arms and the floating photos, and the arms move with time', () => {
    const ctx = fakeWorldContext(20);
    const room = buildRobotsRoom(ctx);
    const arms = named(room.group, 'robot-arm');
    expect(arms).toHaveLength(5);
    expect(count(room.group, 'floaters')).toBe(ctx.strip.robots.floaters.length);
    const grip = () => { room.group.updateMatrixWorld(true); return arms[0].getObjectByName('gripper')!.getWorldPosition(new Vector3()).toArray(); };
    room.update!(10);
    const a = grip();
    room.update!(14);
    expect(grip()).not.toEqual(a);
  });
});

describe('finale', () => {
  it('the carpet has one tile per mosaic cell and spans atlases for large libraries', () => {
    expect(count(buildFinale(fakeWorldContext(20)).group, 'carpet-tiles')).toBe(CARPET.cols * CARPET.rows);
    expect(named(buildFinale(fakeWorldContext(300)).group, 'carpet-tiles')).toHaveLength(2);
  });

  it('blacks out the room during the end of the dive', () => {
    const ctx = fakeWorldContext(20);
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
    const ctx = fakeWorldContext(20);
    const finale = buildFinale(ctx);
    const mosaic = requireSegment(ctx.sequence, 'mosaic');
    const [carpet] = named(finale.group, 'carpet');
    const [tiles] = named(finale.group, 'carpet-tiles') as InstancedMesh[];
    const [overlay] = named(finale.group, 'mosaic-overlay') as Mesh<never, MeshBasicMaterial>[];
    const c = new Color();
    finale.update!(mosaic.start);
    expect(carpet.position.toArray()).toEqual(ctx.strip.finale.carpet);
    tiles.getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
    expect(overlay.material.opacity).toBe(0);
    finale.update!(mosaic.end - 1e-6);
    carpet.position.toArray().forEach((v, i) => expect(v).toBeCloseTo(ctx.strip.finale.lifted[i], 3));
    expect(carpet.scale.x).toBeCloseTo(0.3, 3);
    expect(overlay.material.opacity).toBeCloseTo(1, 3);
    tiles.getColorAt(0, c);
    expect(c.r).not.toBe(1);
  });

  it('grows the network from the portrait sphere outwards', () => {
    const ctx = fakeWorldContext(30);
    const finale = buildFinale(ctx);
    const network = findSegment(ctx.sequence, 'network')!;
    const [group] = named(finale.group, 'network');
    const [core] = named(finale.group, 'network-core');
    const [nodes] = named(finale.group, 'network-nodes') as InstancedMesh[];
    const m = new Matrix4();
    const scaleOf = (i: number) => { nodes.getMatrixAt(i, m); return new Vector3().setFromMatrixScale(m).x; };
    finale.update!(network.start);
    expect(group.visible).toBe(true);
    expect(core.scale.x).toBe(0);
    expect(scaleOf(0)).toBe(0);
    finale.update!(network.end - 1e-6);
    expect(core.scale.x).toBe(1);
    expect(scaleOf(0)).toBeGreaterThan(0.1);
    const [carpet] = named(finale.group, 'carpet');
    expect(carpet.visible).toBe(false);
  });

  it('fades the end card in', () => {
    const ctx = fakeWorldContext(12);
    const finale = buildFinale(ctx);
    const ending = requireSegment(ctx.sequence, 'ending');
    const [card] = named(finale.group, 'end-card') as Mesh<never, MeshBasicMaterial>[];
    finale.update!(ending.start);
    expect(card.material.opacity).toBe(0);
    finale.update!((ending.start + ending.end) / 2);
    expect(card.material.opacity).toBe(1);
  });
});

describe('buildWorld', () => {
  it('hides the rooms once the blackout is complete and blends bloom across boundaries', () => {
    const ctx = fakeWorldContext(20);
    const world = buildWorld(ctx.sequence, ctx.strip, ctx.content, ctx.tex);
    const [rooms] = named(world.scene, 'rooms');
    const dive = requireSegment(ctx.sequence, 'dive');
    world.update(dive.start);
    expect(rooms.visible).toBe(true);
    world.update(dive.end + 0.1);
    expect(rooms.visible).toBe(false);
    const b = ctx.strip.boundaries.find((x) => !x.left.dark && x.right.dark)!;
    expect(world.bloomAt(0, b.x - 3)).toBeCloseTo(0.2, 9);
    expect(world.bloomAt(0, b.x + 3)).toBeCloseTo(1.1, 9);
    expect(world.bloomAt(0, b.x)).toBeCloseTo(0.65, 9);
    expect(world.bloomAt(ctx.sequence.total, 0)).toBeCloseTo(0.25, 9);
  });

  it('updates at every time in every cut and disposes cleanly', () => {
    for (const mode of ['auto', 30, 60] as const) {
      const ctx = fakeWorldContext(8, mode);
      const world = buildWorld(ctx.sequence, ctx.strip, ctx.content, ctx.tex);
      for (let t = 0; t <= ctx.sequence.total; t += 0.7) world.update(t);
      expect(() => world.dispose()).not.toThrow();
    }
  });
});
```

Run: `npx vitest run tests/unit/world-finale.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 2: 實作 `src/stage/world/rooms/robots.ts`**

```ts
import {
  BoxGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type InstancedMesh,
} from 'three';
import { buildAtlasInstances, cellTexture, type AtlasInstance } from '../../parts/atlas-mesh';
import { armAngles, createRobotArm } from '../../parts/robot-arm';
import type { Strip } from '../../strip';
import type { RoomObject, WorldContext } from '../context';

type Floater = Strip['robots']['floaters'][number];

function floaterMatrix(f: Floater, t: number): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(0.2 * Math.sin(0.3 * t + f.phase), f.phase + 0.1 * t, 0));
  return new Matrix4().compose(new Vector3(f.pos[0], f.pos[1] + 0.15 * Math.sin(0.4 * t + f.phase), f.pos[2]), q, new Vector3(f.size, f.size, 1));
}

export function buildRobotsRoom(ctx: WorldContext): RoomObject {
  const { strip, content, mats } = ctx;
  const r = strip.robots;
  const lib = content.library;
  const group = new Group();
  group.name = 'room:robots';
  const p = r.platform;
  const platform = new Mesh(new BoxGeometry(p.width, p.height, p.depth), mats.platform);
  platform.position.set(...p.center);
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
    arm.group.position.set(...spec.pos);
    arm.group.rotation.y = spec.yaw;
    group.add(arm.group);
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
  return { group, update };
}
```

- [ ] **Step 3: 實作 `src/stage/world/finale.ts`**

```ts
import {
  AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, SphereGeometry, Vector3, type InstancedMesh, type Material,
} from 'three';
import { findSegment, localU, requireSegment } from '../../plan/sequence';
import type { Vec3 } from '../../types';
import { clamp, lerp, smoothstep } from '../../util/math';
import { buildAtlasInstances, createAtlasMaterial, type AtlasInstance } from '../parts/atlas-mesh';
import { cropTexture } from '../parts/canvas-block';
import { textUnits } from '../parts/led';
import { createTextPlane } from '../parts/text-plane';
import { CARPET } from '../strip';
import { hiresOf, type RoomObject, type WorldContext } from './context';

/** Multiplier that brings a photo's average colour to the cell colour (softened, clamped). */
const tintOf = (cell: number, photo: number) => 1 + (clamp(cell / Math.max(photo, 0.04), 0, 3) - 1) * 0.9;

type CarpetItem = AtlasInstance & { tint: [number, number, number] };
type NodeItem = AtlasInstance & { pos: Vec3; radius: number; delay: number };

export function buildFinale(ctx: WorldContext): RoomObject & { blackoutAt(t: number): number } {
  const { sequence, strip, content, tex, mats } = ctx;
  const lib = content.library;
  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');
  const d = dive.end - dive.start;
  const group = new Group();
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
  blackout.position.set(...strip.finale.lifted);
  blackout.visible = false;
  const blackoutAt = (t: number) => smoothstep(dive.start + 0.6 * d, dive.end, t);

  // Carpet = the mosaic, laid out on the platform from the start.
  const { cols, rows, pitch, tile } = CARPET;
  const carpet = new Group();
  carpet.name = 'carpet';
  carpet.position.set(...strip.finale.carpet);
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
  const portrait = hiresOf(content, strip.portraitIndex);
  const overlayMaterial = owned(
    new MeshBasicMaterial({ map: cropTexture(portrait, lib.aspects[strip.portraitIndex], cols / rows), transparent: true, opacity: 0, depthWrite: false }),
    true,
  );
  const overlay = new Mesh(new PlaneGeometry(cols * pitch, rows * pitch).rotateX(-Math.PI / 2), overlayMaterial);
  overlay.name = 'mosaic-overlay';
  overlay.position.y = 0.004;
  overlay.renderOrder = 11;
  carpet.add(overlay);

  // Network around the lifted portrait.
  const net = strip.finale.network;
  const networkGroup = new Group();
  networkGroup.name = 'network';
  networkGroup.position.set(...strip.finale.lifted);
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
    networkGroup.add(mesh);
  }
  const lines = (positions: number[], color: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return new LineSegments(geometry, owned(new LineBasicMaterial({ color, transparent: true, opacity: 0 })));
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
  const stars = points(net.stars, 0.09, 0xdfe8ff, 'stars');
  const highlights = points(net.highlights.flatMap(star), 0.28, 0x4aa3ff, 'highlights');
  networkGroup.add(edges, starEdges, stars, highlights);

  // End card, far below, framed by the fixed ending camera.
  const cardGroup = new Group();
  cardGroup.position.set(...strip.finale.card);
  cardGroup.visible = false;
  const name = content.name.toUpperCase();
  const cardTexture = tex.text({
    size: { width: 1760, height: 1080 },
    background: '#f4f4f2',
    align: 'left',
    padding: 150,
    lineGap: 0.12,
    lines: [
      { text: 'The Museum of Me', px: 84, weight: 500, family: 'serif', color: '#1d1d1d' },
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

  const carpetFrom = new Vector3(...strip.finale.carpet);
  const carpetTo = new Vector3(...strip.finale.lifted);
  let lastTint = -1;
  const q = new Quaternion();
  const m = new Matrix4();
  const v = new Vector3();

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
          mesh.setMatrixAt(i, m.compose(v.set(...item.pos), q, new Vector3(s, s, s)));
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

- [ ] **Step 4: 實作 `src/stage/world/world.ts`**

```ts
import { Color, DirectionalLight, Group, HemisphereLight, Scene } from 'three';
import type { StageTextureFactory } from '../../assets/texture-factory';
import { findSegment, requireSegment } from '../../plan/sequence';
import type { Sequence } from '../../types';
import { smoothstep } from '../../util/math';
import { disposeScene } from '../dispose';
import { createStageMaterials } from '../parts/materials';
import type { Room, Strip } from '../strip';
import type { RoomObject, WorldContent, WorldContext } from './context';
import { buildFinale } from './finale';
import { buildLikesRoom } from './rooms/likes';
import { buildMomentsRoom } from './rooms/moments';
import { buildPhotosRoom } from './rooms/photos';
import { buildPortraitsRoom } from './rooms/portraits';
import { buildRobotsRoom } from './rooms/robots';
import { buildVideosRoom } from './rooms/videos';
import { buildWallRoom } from './rooms/wall';
import { buildWordsRoom } from './rooms/words';
import { buildShell } from './shell';

export interface World {
  scene: Scene;
  update(t: number): void;
  /** Bloom intensity for the camera at time t and x position (dark rooms glow more). */
  bloomAt(t: number, x: number): number;
  dispose(): void;
}

const BLOOM_LIGHT = 0.2;
const BLOOM_DARK = 1.1;
const bloomOf = (room: Room) => (room.dark ? BLOOM_DARK : BLOOM_LIGHT);

export function buildWorld(sequence: Sequence, strip: Strip, content: WorldContent, tex: StageTextureFactory): World {
  const mats = createStageMaterials();
  const ctx: WorldContext = { sequence, strip, content, tex, mats };
  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new HemisphereLight(0xffffff, 0xcfcac2, 1.15));
  const sun = new DirectionalLight(0xffffff, 0.5);
  sun.position.set(-20, 30, 40);
  scene.add(sun);

  const rooms = new Group();
  rooms.name = 'rooms';
  rooms.add(buildShell(ctx));
  const built: (RoomObject | null)[] = [
    buildWallRoom(ctx), buildPortraitsRoom(ctx), buildPhotosRoom(ctx), buildMomentsRoom(ctx),
    buildWordsRoom(ctx), buildLikesRoom(ctx), buildVideosRoom(ctx), buildRobotsRoom(ctx),
  ];
  const updaters: ((t: number) => void)[] = [];
  for (const room of built) {
    if (!room) continue;
    rooms.add(room.group);
    if (room.update) updaters.push(room.update);
  }
  const finale = buildFinale(ctx);
  scene.add(rooms, finale.group);

  const dive = requireSegment(sequence, 'dive');
  const mosaic = requireSegment(sequence, 'mosaic');
  const network = findSegment(sequence, 'network');
  const ending = requireSegment(sequence, 'ending');

  return {
    scene,
    update(t) {
      rooms.visible = t < dive.end;
      if (rooms.visible) for (const u of updaters) u(t);
      finale.update!(t);
    },
    bloomAt(t, x) {
      if (t >= ending.start) return 0.25;
      if (network && t >= network.start) return BLOOM_DARK;
      if (t >= mosaic.start) return 0.3;
      if (t >= dive.start) return BLOOM_LIGHT;
      let nearest = strip.boundaries[0];
      for (const b of strip.boundaries) if (Math.abs(b.x - x) < Math.abs(nearest.x - x)) nearest = b;
      if (!nearest) return bloomOf(strip.rooms[0]);
      const k = smoothstep(nearest.x - 1.5, nearest.x + 1.5, x);
      return bloomOf(nearest.left) + (bloomOf(nearest.right) - bloomOf(nearest.left)) * k;
    },
    dispose() {
      disposeScene(scene);
      mats.dispose();
    },
  };
}
```

- [ ] **Step 5: 執行確認通過**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS（world-finale 8 passed）

- [ ] **Step 6: 提交**

```bash
git add src/stage/world tests/unit/world-finale.test.ts
git commit -m "feat(v3): robot room, carpet-to-mosaic-to-network finale and world assembly in one scene"
```

---
### Task 11: 世界渲染器與淡入淡出 `render/world-fades.ts`、`render/world-renderer.ts`

**Files:**
- Create: `src/render/world-fades.ts`, `src/render/world-renderer.ts`
- Test: `tests/unit/world-fades.test.ts`

**Interfaces:**
- Consumes: `World`（Task 10）、`CameraPath`（Task 6）、`GradeEffect`（Task 1）、`findSegment`, `requireSegment`
- Produces: `interface Fade { white: boolean; amount: number }`、`worldFadeAt(sequence, t): Fade`；`interface MuseumRenderer`（同 v2）、`createWorldRenderer({ canvas, world, camera, sequence }): MuseumRenderer`

- [ ] **Step 1: 寫失敗的測試 `tests/unit/world-fades.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import { worldFadeAt } from '../../src/render/world-fades';

describe('worldFadeAt', () => {
  const s = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null });
  const photos = requireSegment(s, 'photos');
  const network = requireSegment(s, 'network');
  const ending = requireSegment(s, 'ending');

  it('opens from black and is clear through the one-take walk', () => {
    expect(worldFadeAt(s, 0)).toEqual({ white: false, amount: 1 });
    expect(worldFadeAt(s, 1.0).amount).toBe(0);
    for (let t = 1.0; t < network.end - 3; t += 0.25) expect(worldFadeAt(s, t).amount, `t=${t}`).toBe(0);
    expect(worldFadeAt(s, (photos.start + photos.end) / 2).amount).toBe(0);
  });

  it('fades the network out to black, hides the cut to the card and fades the card in', () => {
    expect(worldFadeAt(s, network.end - 1e-6).amount).toBeCloseTo(1, 5);
    expect(worldFadeAt(s, ending.start).amount).toBe(1);
    expect(worldFadeAt(s, ending.start + 1.2).amount).toBe(0);
    expect(worldFadeAt(s, s.total)).toEqual({ white: false, amount: 1 });
  });

  it('never flashes white', () => {
    for (let t = 0; t <= s.total; t += 0.5) expect(worldFadeAt(s, t).white).toBe(false);
  });

  it('fades out the mosaic when the cut has no network', () => {
    const short = buildSequence({ photoCount: 5, lengthMode: 30, musicDuration: null });
    const mosaic = requireSegment(short, 'mosaic');
    expect(worldFadeAt(short, mosaic.end - 1e-6).amount).toBeCloseTo(1, 5);
    expect(worldFadeAt(short, (mosaic.start + mosaic.end) / 2).amount).toBe(0);
  });
});
```

Run: `npx vitest run tests/unit/world-fades.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 2: 實作 `src/render/world-fades.ts`**

```ts
import { findSegment } from '../plan/sequence';
import type { Sequence } from '../types';
import { smoothstep } from '../util/math';

export interface Fade {
  white: boolean;
  amount: number;
}

/** One take: fade in from black, fade the last scene out to black, cut to the card in black, fade the card in. */
export function worldFadeAt(sequence: Sequence, t: number): Fade {
  let amount = 1 - smoothstep(0, 1, t);
  const ending = findSegment(sequence, 'ending');
  if (ending) {
    const before = sequence.segments[sequence.segments.indexOf(ending) - 1];
    if (t < ending.start && before) {
      const d = before.end - before.start;
      amount = Math.max(amount, smoothstep(before.end - Math.min(2.5, 0.15 * d), before.end, t));
    } else if (t >= ending.start) {
      amount = Math.max(amount, 1 - smoothstep(ending.start, ending.start + 1.2, t));
    }
  }
  amount = Math.max(amount, smoothstep(sequence.total - 1.2, sequence.total, t));
  return { white: false, amount };
}
```

- [ ] **Step 3: 實作 `src/render/world-renderer.ts`**

```ts
import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, NoToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CameraPath } from '../camera/path';
import type { World } from '../stage/world/world';
import { FPS, type Sequence } from '../types';
import { GradeEffect } from './grade-effect';
import { worldFadeAt } from './world-fades';

export interface MuseumRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  /** The only drawing entry point: preview and export both call this. */
  renderFrame(t: number): void;
  dispose(): void;
}

export interface WorldRendererOptions {
  canvas: HTMLCanvasElement;
  world: World;
  camera: CameraPath;
  sequence: Sequence;
}

export function createWorldRenderer(o: WorldRendererOptions): MuseumRenderer {
  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;

  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  o.world.scene.environment = environment;
  o.world.scene.environmentIntensity = 0.8;

  const camera = new PerspectiveCamera(38, 16 / 9, 0.05, 500);
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(o.world.scene, camera));
  const ao = new N8AOPostPass(o.world.scene, camera, 1280, 720);
  ao.configuration.aoRadius = 1.0;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.intensity = 2.2;
  ao.setQualityMode('High');
  // See the v2 ruling: N8AO's copy quad must not depth-test against postprocessing's shared depth texture.
  const copyMaterial = (ao as unknown as { copyQuad: { material: { depthTest: boolean; depthWrite: boolean } } }).copyQuad.material;
  copyMaterial.depthTest = false;
  copyMaterial.depthWrite = false;
  composer.addPass(ao);
  const dof = new DepthOfFieldEffect(camera, { focusDistance: 7, focusRange: 3.5, bokehScale: 2 });
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, intensity: 0.2 });
  const grade = new GradeEffect();
  composer.addPass(
    new EffectPass(
      camera,
      new SMAAEffect({ preset: SMAAPreset.HIGH }),
      dof,
      bloom,
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.3, darkness: 0.55 }),
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
    o.world.update(t);
    const pose = o.camera.poseAt(t);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    dof.cocMaterial.focusDistance = pose.focus;
    const glow = o.world.bloomAt(t, pose.pos[0]);
    bloom.intensity = glow;
    ao.configuration.intensity = glow > 0.6 ? 1.0 : 2.2;
    grade.setState(worldFadeAt(o.sequence, t), Math.round(t * FPS));
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

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/unit/world-fades.test.ts && npx tsc --noEmit`
Expected: PASS（4 passed），型別檢查無錯誤

- [ ] **Step 5: 提交**

```bash
git add src/render tests/unit/world-fades.test.ts
git commit -m "feat(v3): world renderer with depth of field, per-room bloom and one-take fades"
```

---

### Task 12: 切換到一鏡到底並移除 v2 分鏡

**Files:**
- Modify: `src/app/project.ts`（整檔取代）、`src/main.ts`、`src/render/grade-effect.ts`（Fade 的來源）、`src/types.ts`（移除 v2 型別）、`tests/e2e/preview.spec.ts`（整檔取代）、`README.md`
- Delete: `src/plan/storyboard.ts`、`src/stage/layout.ts`、`src/stage/wall-run.ts`、`src/stage/context.ts`、`src/stage/build.ts`、`src/stage/sets/`、`src/camera/shots.ts`、`src/camera/hermite.ts`、`src/render/transitions.ts`、`src/render/stage-renderer.ts`、`tests/unit/storyboard.test.ts`、`tests/unit/stage-layout.test.ts`、`tests/unit/shots.test.ts`、`tests/unit/stage-wall.test.ts`、`tests/unit/stage-dark.test.ts`、`tests/unit/stage-build.test.ts`、`tests/unit/transitions.test.ts`、`tests/unit/hermite.test.ts`、`tests/unit/fake-stage.ts`

**Interfaces:**
- Produces: `interface Project { input; sequence: Sequence; strip: Strip; world: World; camera: CameraPath; soundtrack: AudioBuffer; warnings: string[]; dispose() }`；`buildProject(input, pool, onStatus)`（簽名不變）

- [ ] **Step 1: 寫失敗的 e2e `tests/e2e/preview.spec.ts`（整檔取代）**

```ts
import { expect, test, type Page } from '@playwright/test';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import type { SegmentId } from '../../src/types';
import { fillSetup } from './helpers';

const KIND: Record<SegmentId, 'white' | 'dark' | 'black' | 'any'> = {
  title: 'white', exhibition: 'white', intro: 'white', portraits: 'white', photos: 'white',
  moments: 'dark', words: 'dark', likes: 'dark', videos: 'dark', robots: 'white',
  dive: 'any', mosaic: 'any', network: 'black', ending: 'any',
};

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

const storyboardFor = () => buildSequence({ photoCount: 5, lengthMode: 'auto', musicDuration: null });

test('every segment renders with the expected brightness inside a 2.35:1 letterbox', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const sequence = storyboardFor();
  expect(Number(await page.locator('#scrub').getAttribute('max'))).toBeCloseTo(sequence.total, 6);
  for (const segment of sequence.segments) {
    const stats = await frameStats(page, (segment.start + segment.end) / 2);
    await page.locator('#viewport canvas').screenshot({ path: test.info().outputPath(`seg-${segment.id}.png`) });
    expect(stats.barMax, `${segment.id} letterbox`).toBeLessThan(14);
    expect(stats.contrast, `${segment.id} contrast`).toBeGreaterThan(20);
    const kind = KIND[segment.id];
    if (kind === 'white') expect(stats.median, `${segment.id} white room`).toBeGreaterThan(120);
    if (kind === 'dark') expect(stats.median, `${segment.id} dark room`).toBeLessThan(70);
    if (kind === 'black') expect(stats.median, `${segment.id} black space`).toBeLessThan(20);
  }
  expect(errors).toEqual([]);
});

test('the walk is one take: no sudden change of the whole picture between rooms', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const sequence = storyboardFor();
  const roomStarts = (['portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots'] as const).map((id) => requireSegment(sequence, id).start);
  const end = requireSegment(sequence, 'network').end - 3;
  let previous: number | null = null;
  const jumps: string[] = [];
  for (let t = 1.5; t < end; t += 0.5) {
    const { median } = await frameStats(page, t);
    const nearBoundary = roomStarts.some((s) => Math.abs(t - s) < 1.3);
    if (previous !== null && !nearBoundary && Math.abs(median - previous) >= 60) jumps.push(`t=${t}: ${previous} → ${median}`);
    previous = median;
  }
  expect(jumps).toEqual([]);
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

Run: `npx playwright test tests/e2e/preview.spec.ts`
Expected: FAIL（v2 的總長與分段不同，第一個斷言 `#scrub max` 就不符）

- [ ] **Step 2: 取代 `src/app/project.ts`**

```ts
import { bitmapToTexture, loadHires, loadLibrary } from '../assets/library';
import type { PhotoPool } from '../assets/photo-pool';
import { createCanvasTextureFactory, ensureFonts, rasterizeLines } from '../assets/text';
import { buildSoundtrack, probeAudioDuration } from '../audio/soundtrack';
import { buildCameraPath, type CameraPath } from '../camera/path';
import { buildSequence } from '../plan/sequence';
import { LED, ledLines, ledWords } from '../stage/parts/led';
import { CARPET, computeStrip, type Strip } from '../stage/strip';
import { buildWorld, type World } from '../stage/world/world';
import type { ProjectInput, Sequence } from '../types';
import { MIN_PHOTOS } from '../ui/validate';
import { exhibitionDate, formatDisplayDate, formatExhibitionStamp } from '../util/format';
import { hashString } from '../util/rng';

export interface Project {
  input: ProjectInput;
  sequence: Sequence;
  strip: Strip;
  world: World;
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
    'Portraits Photos Moments Words Likes Videos The faces in this collection. Moments worth keeping. Where and when.',
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
    const strip = computeStrip({ sequence, aspects: library.aspects, portraitIndex, seed });

    onStatus('準備展示用的高解析照片…');
    await loadHires(library, input.photos, strip.featured, pool);

    onStatus('計算馬賽克…');
    const colors = await pool.grid(input.photos[library.sourceIndices[portraitIndex]], CARPET.cols, CARPET.rows);
    const assignment = await pool.mosaic(colors, new Float32Array(library.colors.flat()), seed);

    onStatus('繪製 LED 字牆…');
    const led = async (lines: string[]) => bitmapToTexture(await pool.led(rasterizeLines(lines, LED.cols, LED.rows), LED.cols, LED.rows, LED.dot));
    const main = await led(ledLines(words, LED.mainRows, LED.mainUnits));
    const highlight = await led(ledLines(words.slice(0, 1), LED.highlightRows, LED.highlightUnits));
    cleanup.push(() => {
      main.dispose();
      highlight.dispose();
    });

    onStatus('布置展廳…');
    const world = buildWorld(sequence, strip, {
      library,
      name: input.name,
      subtitle: input.subtitle,
      stamp: formatExhibitionStamp(exhibitionDate(input.date, new Date())),
      dateLabel: formatDisplayDate(input.date),
      captions,
      led: { main, highlight },
      mosaic: { colors, assignment },
    }, createCanvasTextureFactory());
    cleanup.push(() => world.dispose());
    const camera = buildCameraPath(sequence, strip);

    onStatus('合成配樂…');
    const soundtrack = await soundtrackPromise;
    if (soundtrack.warning) warnings.push(soundtrack.warning);

    return {
      input, sequence, strip, world, camera, soundtrack: soundtrack.buffer, warnings,
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

- [ ] **Step 3: 更新 `src/main.ts`、`src/render/grade-effect.ts`**

`src/main.ts`：
- 把 `import { createStageRenderer, type MuseumRenderer } from './render/stage-renderer';` 改為 `import { createWorldRenderer, type MuseumRenderer } from './render/world-renderer';`
- 在 `openStage` 中：`const total = project.storyboard.total;` 改為 `const total = project.sequence.total;`；`const renderer = createStageRenderer({ canvas, stage: project.stage, camera: project.camera, storyboard: project.storyboard });` 改為 `const renderer = createWorldRenderer({ canvas, world: project.world, camera: project.camera, sequence: project.sequence });`
- 在 `runExport` 中：`total: s.project.storyboard.total` 改為 `total: s.project.sequence.total`

`src/render/grade-effect.ts`：`import type { Fade } from './transitions';` 改為 `import type { Fade } from './world-fades';`

- [ ] **Step 4: 刪除 v2 分鏡模組並清理型別**

```bash
git rm -r -q src/plan/storyboard.ts src/stage/layout.ts src/stage/wall-run.ts src/stage/context.ts src/stage/build.ts src/stage/sets \
  src/camera/shots.ts src/camera/hermite.ts src/render/transitions.ts src/render/stage-renderer.ts \
  tests/unit/storyboard.test.ts tests/unit/stage-layout.test.ts tests/unit/shots.test.ts tests/unit/stage-wall.test.ts \
  tests/unit/stage-dark.test.ts tests/unit/stage-build.test.ts tests/unit/transitions.test.ts tests/unit/hermite.test.ts tests/unit/fake-stage.ts
```

在 `src/types.ts` 中刪除 `ShotId`、`SHOT_ORDER`、`ShotSpan`、`Storyboard` 的宣告。

Run: `npx tsc --noEmit && grep -rn "storyboard\|stage/sets\|wall-run\|camera/shots\|camera/hermite\|stage-renderer\|render/transitions\|stage/build\|fake-stage" src tests || echo clean`
Expected: 型別檢查無錯誤，並輸出 `clean`

- [ ] **Step 5: 更新 README 的分鏡段落**

把 `## 分鏡（依原作順序）` 之下、`- 照片 3–500 張` 之前的那一段換成：
```markdown
一鏡到底，依原作逐格分析重建：鏡頭沿一整排並排的房間等速橫移（起始朝右斜看 18°，於展名出現前轉正），經過白牆標題 → 展名與時間戳 → 說明文字 → 轉角 → Portraits → Photos → 暗房 Moments → Words（邊移邊推近 LED 字牆）→ Likes → Videos → 機器手臂房；房間之間以隔柱擦過轉場。接著鏡頭下降掠過照片地毯，房間漸暗，地毯浮起變成馬賽克肖像，再化為網絡中心，拉遠成星座，最後是片尾卡片。全片 2.35:1 黑邊、sRGB 調色與景深。
```

- [ ] **Step 6: 執行全部測試**

Run: `npx vitest run && npx tsc --noEmit && npx playwright test`
Expected: 全部 PASS（含 `export.spec.ts`：30 s 720p MP4 仍為 900 格、H.264 + AAC）。
- 亮度門檻失敗時：只調整材質顏色、燈光，或 `world.bloomAt` 的強度，不改門檻。
- 「one take」失敗時：錯誤訊息會列出時間點，檢查該時段的鏡頭路徑或淡入淡出。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(v3): switch to the one-take gallery strip and remove the v2 shot-based stage"
```

---

### Task 13: 與原作並排比對與調整

**Files:**
- Create: `tests/e2e/acceptance.spec.ts`
- Modify: `package.json`（新增 `compare` 指令）；依比對結果可能調整 `src/stage/strip.ts`、`src/camera/path.ts`、`src/stage/world/**` 的常數

**Interfaces:**
- Consumes: 全部
- Produces: `test-results/compare.png`（上排原作、下排仿作，16 組）

- [ ] **Step 1: 建立 `tests/e2e/acceptance.spec.ts`**

```ts
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildSequence, localU, segmentIndexAt } from '../../src/plan/sequence';
import { fillSetup } from './helpers';

/** Seconds in the original film at which to compare (spread over the whole one take). */
const ANCHORS = [1.5, 10.5, 18.5, 23, 30, 46, 58, 70, 80, 98, 112, 124, 138, 155, 166, 185];

test('side-by-side comparison with the original film', async ({ page }) => {
  const original = process.env.ORIGINAL;
  test.skip(!original, 'set ORIGINAL=/path/to/the/original.mp4 to run the comparison');
  test.setTimeout(10 * 60_000);
  const out = path.resolve('test-results/compare');
  mkdirSync(out, { recursive: true });
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const reference = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null }); // photos 15 s, as in the original
  const ours = buildSequence({ photoCount: 5, lengthMode: 'auto', musicDuration: null });
  for (const [k, t] of ANCHORS.entries()) {
    const i = segmentIndexAt(reference, t);
    const u = localU(reference.segments[i], t);
    const segment = ours.segments.find((s) => s.id === reference.segments[i].id)!;
    await page.locator('#scrub').fill(String(segment.start + u * (segment.end - segment.start)));
    await page.locator('#viewport canvas').screenshot({ path: `${out}/ours-${k}.png` });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', original!, '-frames:v', '1', '-vf', 'scale=480:-2', `${out}/orig-${k}.png`]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/ours-${k}.png`, '-vf', 'scale=480:-2', `${out}/ours-s-${k}.png`]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/orig-${k}.png`, '-i', `${out}/ours-s-${k}.png`, '-filter_complex', '[0]pad=480:ih[a];[1]scale=480:-2[b];[a][b]vstack', `${out}/pair-${k}.png`]);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', `${out}/pair-%d.png`, '-vf', 'tile=4x4:padding=6:color=red', '-frames:v', '1', path.resolve('test-results/compare.png')]);
});
```

`package.json` 的 `scripts` 加入：
```json
    "compare": "playwright test tests/e2e/acceptance.spec.ts"
```

- [ ] **Step 2: 產生比對圖**

Run: `ORIGINAL="/home/sam/Downloads/Intel Museum of Me_720p.mp4" npm run compare && ls -la test-results/compare.png`
Expected: 產生 `test-results/compare.png`（4 × 4 格，每格上為原作、下為仿作）。沒有設定 `ORIGINAL` 時，這個測試會被 skip。

- [ ] **Step 3: 逐格比對並調整**

開啟 `test-results/compare.png`，對 16 組逐一檢查：
- 牆與地的交線角度（開場斜看，之後水平）；
- 文字與物件在畫面中的位置與大小；
- 房間的明暗；
- 隔柱擦過的時機；
- 推近的距離；
- 下降的構圖；
- 馬賽克的傾斜；
- 網絡的密度。

差異只透過常數修正，例如：
- `strip.ts` 的 `LINE`、`TEXT`、各房間物件的座標；
- `path.ts` 的 dive 關鍵點；
- `finale.ts` 的旋轉與縮放曲線；
- `materials.ts` 的顏色。

每次調整後重跑：
`npx vitest run && npx playwright test tests/e2e/preview.spec.ts && ORIGINAL=… npm run compare`
保持全部通過。

- [ ] **Step 4: 最終驗證並提交**

Run: `npm test && npm run typecheck && npm run build && npx playwright test`
Expected: 全部 PASS（acceptance 在沒有 `ORIGINAL` 時 skip）

```bash
git add -A
git commit -m "test(v3): side-by-side comparison with the original film, and tuning"
```
