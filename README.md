# The Museum of Me（仿作）

仿 Intel × Rhizomatiks《The Museum of Me》（2011）：選擇照片、填入名字與關鍵字，生成一段在純白 3D 美術館中漫步的紀念影片，並直接在瀏覽器中匯出 MP4。照片、音樂都不會離開你的電腦；解碼與重運算在 Web Worker 中完成。

## 使用

```bash
npm install
npm run dev        # http://localhost:5173
```

1. 選擇 3–500 張照片，拖曳縮圖調整順序；點選縮圖可編輯說明文字或設為「主視覺」。
2. 填入主角名字（必填）、副標題、日期、關鍵字與照片說明。
3. 選擇長度（自動、30／60／90／120 秒或配合音樂長度）、解析度（720p／1080p）與配樂。
4. 「布置展廳」後即可預覽；「匯出影片」會逐格渲染並下載 `museum-of-<名字>-<日期>.mp4`。

建議使用最新版 Chrome 或 Edge（需要 WebCodecs H.264 編碼）；其他瀏覽器若只支援 VP9，會改為輸出 WebM。

## 分鏡（依原作順序）

一鏡到底，鏡頭軌跡依原作逐秒量測（光流與標示牌尺寸）重建：
- 開場從右前方斜看白牆，一邊轉正一邊推近；展名時完全平行並位於正中。
- 標題 → 展名 → 說明文字之後，鏡頭擦過白色厚隔牆，進入 Friends 與 Photos。兩者在同一面牆上；鏡頭在 Photos 後段逐步拉遠並升高，讓整面照片牆入鏡。
- 深色隔柱擦過後進入淺房 Location，再直線走近凹室中的 Words LED 字牆。字牆每一行跑馬燈與上一行方向相反，字的放大與 COM 滿版是螢幕本身的內容切換。
- 向右轉進入暗色大廳，繞著讚手勢旋轉：Likes 的古早映像管電視、會動態換照片的網格照片牆（Photos 5.2）、Videos 影像牆。之後沿影像牆橫移。
- 深色門板擦過後，直線走向機器手臂房的平台。
- 下降掠過照片地毯 → 地毯浮起成馬賽克肖像 → 網絡中心與星座 → 片尾卡片。

全片 2.35:1 黑邊、sRGB 調色與景深。`npm run compare`（需設定 `ORIGINAL=原作影片路徑`）會輸出每 2 秒一組的並排截圖（`test-results/compare-1…5.png`），以及逐段鏡頭運動比較表（`test-results/motion.md`）。

- 照片 3–500 張，由 Worker 池並行解碼並打包成縮圖圖集。
- 表單右側的「場景」列出 Friends 畫布、Photos 照片牆、Location 燈箱、Likes 古早電視、Photos 5.2 網格牆、Videos 影像牆與機器手臂房漂浮照片。上傳後會自動分配，可把左側照片拖進任一場景（同一張可放在多個場景）、按 × 移出、在場景內拖曳排序；場景內的順序就是影片中的順序。馬賽克地毯與網絡一律使用全部照片。
- 長度：自動、30／60／90／120 秒，或「配合音樂長度」（上傳音樂後可選，30–300 秒）。
- 配樂：空靈鋼琴（致敬原作氛圍，原創）、靜謐鋼琴，或上傳你持有的音樂（例如原作配樂）。
- 不含任何 Intel／Facebook 商標或原作配樂的錄音。

## 開發

```bash
npm test           # Vitest 單元測試（時間表、配置、鏡頭、配樂、場景）
npm run test:e2e   # Playwright（使用系統 Google Chrome；匯出測試需數分鐘）
npm run typecheck
npm run build
npm run fixtures   # 重新產生 tests/fixtures（需要 ffmpeg）
```

架構與設計決策見 `docs/superpowers/specs/2026-09-28-museum-of-me-design.md`。
