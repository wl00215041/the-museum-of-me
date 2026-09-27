# The Museum of Me（仿作）— 設計規格

日期：2026-09-28
狀態：待審閱

## 1. 目的與範圍

仿作 Intel × Rhizomatiks 於 2011 年推出的 *The Museum of Me*：將個人資料化為一座純白極簡美術館的導覽影片。原作以 Facebook 資料為來源；本仿作改為**使用者自選照片與文字**，定位為**活動／紀念影片產生器**（婚禮、畢業、生日回顧等）。

**成功標準**

1. 使用者在瀏覽器中選取 3–60 張照片並填入文字資訊。
2. 可即時預覽具原作氛圍的 3D 美術館導覽（預覽與成品畫面一致）。
3. 可匯出含配樂的 MP4 影片檔（720p／1080p，30fps），畫面不掉格。
4. 全程在瀏覽器端完成，照片不離開使用者電腦。

**非目標**

- 不串接 Facebook 或任何社群平台。
- 不做後端、帳號、雲端儲存。
- 不以手機為主要目標（桌機 Chrome/Edge 為主；其他瀏覽器盡力而為）。
- 不提供運鏡的手動關鍵影格編輯。

## 2. 使用者輸入

| 欄位 | 必填 | 說明 |
|---|---|---|
| 照片 | 是 | 3–60 張（JPEG/PNG/WebP；其他格式如 HEIC 視瀏覽器解碼能力，失敗則略過）。可拖曳排序。超過 60 張只取前 60 張並提示。 |
| 主視覺肖像 | 是 | 從照片中指定一張；預設為第一張。用於大廳與終章。 |
| 主角名字 | 是 | 用於「THE MUSEUM OF ○○」。支援中日韓文字。 |
| 展覽標題副標 | 否 | 例：「2026 畢業紀念」。顯示於入口與片尾。 |
| 日期 | 否 | 顯示於片尾字卡。 |
| 照片說明 | 否 | 每張照片一段短文字，顯示於解說牌；空白則解說牌僅顯示編號。 |
| 關鍵字／短語 | 否 | 以逗號或換行分隔，最多 40 個。空白則略過關鍵字廳。 |
| 時長模式 | 是 | 「自動（依照片數）」或固定 30／60／90／120 秒。預設自動。 |
| 解析度 | 是 | 720p 或 1080p。預設 1080p。 |
| 配樂 | 否 | 上傳音訊檔；未上傳則使用內建程式合成配樂。 |

## 3. 場景流程

鏡頭全程為緩慢、平順的軌道式滑行（原作風格），場景之間在同一座連續建築中移動，無硬切。

| # | 場景 ID | 內容 | 基準時長 |
|---|---|---|---|
| 1 | `opening` | 白畫面淡入；入口牆上大字「THE MUSEUM OF ○○」與副標；鏡頭推進穿過門洞。 | 6 s |
| 2 | `hall` | 大廳正牆巨幅畫框展示主視覺肖像，聚光燈，鏡頭緩慢推近。 | 8 s |
| 3 | `corridor` | 長廊兩側牆面以格狀小畫框排滿所有照片，鏡頭沿廊道平移。 | 8 s |
| 4 | `gallery` | 主展廳：照片逐一以大畫框加解說牌展示，鏡頭滑至每站並短暫停留。 | 可伸縮 |
| 5 | `keywords` | 關鍵字以不同字級組成懸吊式文字裝置，鏡頭繞行。 | 8 s |
| 6 | `network` | 照片化為懸浮小方塊，以細線互相連結，整體緩慢旋轉（呼應原作社群網路）。 | 8 s |
| 7 | `finale` | 參觀者剪影站在主肖像前，鏡頭從其背後拍攝；淡出至白底片尾字卡（標題＋日期）。 | 8 s |

### 3.1 時長分配規則（`plan` 模組）

- 常數：`GALLERY_SECONDS_PER_PHOTO = 3`、每站最少停留 `MIN_STOP = 2 s`、每站最多掛 `MAX_PER_STOP = 3` 張。
- **場景啟用**：
  - `keywords` 僅在有關鍵字時啟用。
  - 固定 30 秒模式：停用 `keywords`、`network`，其餘場景基準時長依比例壓縮（`opening` 4 s、`hall` 5 s、`corridor` 5 s、`finale` 6 s）。
- **自動模式**：`gallery = min(N × 3 s, 120 s)`（N 為照片數），總長 = 啟用場景基準時長總和 + gallery（約 55–166 s）。N > 40 時因上限而套用下方分組規則（每站 2 張，站數 `ceil(N / 2)`，每站 ≥ 3 s 維持節奏）。
- **固定模式**：`gallery = 總長 − 其他啟用場景時長`。
  - 若 `gallery / N < MIN_STOP`：將照片分組，每站並排 2–3 張，站數 = `ceil(N / perStop)`，取能滿足 `MIN_STOP` 的最小 `perStop`；若 `perStop = 3` 仍不足，則 `gallery` 只展示前 `floor(gallery / MIN_STOP) × 3` 張，其餘照片僅出現在長廊與網絡裝置中（所有照片至少在長廊出現一次）。
  - 若每站時間過長（> 8 s），多出的時間平均分給鏡頭移動，放慢速度。
- `plan` 輸出：`Timeline = { total, scenes: [{ id, start, end }], galleryStops: [{ start, end, photoIndices }] }`。
- 不變式：場景首尾相接、無間隙；`scenes` 總長 = `total`；主展廳各站無重複照片。

## 4. 視覺風格

- 純白牆面、淺灰微反光地板、柔和天光，搭配畫框上方的聚光燈。
- 色調映射 AgX（或 ACES），sRGB 輸出。
- 後製：環境光遮蔽（N8AO 或 SSAO）、輕微暈影、膠片顆粒（以影格編號作為雜訊 seed，確保可重現）。
- 畫框：細黑或白色木框加白色卡紙襯邊；照片依原始長寬比放置，不裁切。
- 所有文字（標題、解說牌、關鍵字、片尾）使用 canvas 2D 繪製成貼圖，字型堆疊為 `"Noto Sans TC", "Noto Sans JP", system-ui, sans-serif`（Noto Sans TC 以 Google Fonts 載入，並在繪製前等待 `document.fonts.ready`）。
- 參觀者剪影：以簡單幾何體組成的低多邊形人形，材質為深灰霧面。

## 5. 技術架構

技術棧：Vite + TypeScript + three.js + postprocessing（pmndrs）+ mediabunny。測試：Vitest + Playwright。

### 5.1 模組

| 模組 | 職責 | 介面（摘要） |
|---|---|---|
| `src/input/` | 表單 UI、驗證、拖曳排序 | 產出 `ProjectInput` |
| `src/assets/` | 照片解碼（`createImageBitmap(file, { imageOrientation: 'from-image' })`）、縮至最長邊 2048 px、建立 `THREE.Texture`；canvas 文字貼圖 | `loadPhotos(files) → Photo[]`、`makeTextTexture(opts) → Texture` |
| `src/plan/` | 純函式時長分配（§3.1） | `buildTimeline(input) → Timeline` |
| `src/museum/` | 依 Timeline 程式化建構建築與各場景裝置；每個場景一個檔案 | `buildMuseum(timeline, assets) → { scene, anchors, update(t) }` |
| `src/camera/` | 由場景錨點生成鏡頭路徑（CatmullRom 曲線＋緩動＋停留） | `buildCameraPath(timeline, anchors) → { poseAt(t) }` |
| `src/render/` | WebGLRenderer 與後製管線；`renderFrame(t)` 為唯一繪製入口 | `createRenderer(canvas, size)`、`renderFrame(t)` |
| `src/audio/` | 合成配樂（OfflineAudioContext，固定 seed 和弦進行、鋼琴＋氛圍 pad，尾段淡出）；或解碼上傳音訊、裁切、淡入淡出 | `buildSoundtrack(input, duration) → AudioBuffer` |
| `src/preview/` | 即時預覽：播放、暫停、拖曳時間軸，與 AudioBuffer 同步 | `createPreview(renderer, audio, timeline)` |
| `src/export/` | 逐格渲染並編碼 MP4 | `exportVideo(opts, onProgress, signal) → Blob` |

### 5.2 決定性（determinism）

- 畫面完全由 `t` 決定：`museum.update(t)` 與 `camera.poseAt(t)` 不得讀取系統時間或 `Math.random()`；所有隨機性使用以輸入為 seed 的 PRNG。
- 預覽與匯出共用同一套 `renderFrame(t)`，保證所見即所得。

### 5.3 匯出流程

1. 建立與輸出解析度相同尺寸的離屏 canvas 與獨立 renderer（不受視窗大小影響）。
2. 以 Mediabunny 建立 `Output`（`Mp4OutputFormat`、`BufferTarget`），視訊使用 `CanvasSource`（AVC，1080p 約 12 Mbps／720p 約 6 Mbps），音訊使用 `AudioBufferSource`（AAC 192 kbps）。
3. 逐格 `i = 0 … total × 30 − 1`：`renderFrame(i / 30)` → `videoSource.add(i / 30, 1 / 30)`；等待其 Promise 以遵守背壓。
4. 加入整段 AudioBuffer，`finalize()`，產出 Blob 並觸發下載（檔名 `museum-of-<name>-<yyyymmdd>.mp4`）。
5. 以 `AbortSignal` 支援取消；回報進度與預估剩餘時間。

### 5.4 錯誤處理

| 情境 | 處理 |
|---|---|
| 不支援 WebCodecs／AVC 編碼 | 以 `canEncodeVideo` 偵測；改用 VP9 + Opus 的 WebM；皆不支援則提示改用 Chrome/Edge |
| 照片解碼失敗 | 略過該張並列出失敗檔名 |
| 照片少於 3 張 | 禁用「生成」按鈕並提示 |
| 照片超過 60 張 | 只取前 60 張並提示 |
| 上傳音訊解碼失敗 | 提示並改用內建配樂 |
| WebGL context lost | 中止匯出，提示重試 |
| 匯出中取消 | 釋放 encoder 與資源，回到預覽 |

## 6. 測試

- **Vitest 單元測試**
  - `plan`：多組 (N, 時長模式, 有無關鍵字) 的不變式——場景無縫相接、總長正確、30 秒模式停用正確場景、分組規則、所有照片至少出現在長廊。
  - `camera`：路徑在場景邊界連續（位置差異小於閾值）、停留期間鏡頭靜止。
  - `audio`（以 `OfflineAudioContext` 可用的環境或抽出純函式部分）：和弦序列決定性、輸出長度等於影片長度。
- **Playwright 端對端**：載入 5 張測試圖、720p、30 秒模式，匯出 MP4；以 `ffprobe` 驗證時長（±0.1 s）、解析度 1280×720、影格數 900、含一條 AAC 音軌。

## 7. 部署

`vite build` 產出純靜態網站，可放在任何靜態主機；無伺服器端邏輯。
