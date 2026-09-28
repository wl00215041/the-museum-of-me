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

一鏡到底，依原作逐格分析重建：鏡頭沿一整排並排的房間等速橫移（起始朝右斜看 18°，於展名出現前轉正），經過白牆標題 → 展名與時間戳 → 說明文字 → 轉角 → Portraits → Photos → 暗房 Moments → Words（邊移邊推近 LED 字牆）→ Likes → Videos → 機器手臂房；房間之間以隔柱擦過轉場。接著鏡頭下降掠過照片地毯，房間漸暗，地毯浮起變成馬賽克肖像，再化為網絡中心，拉遠成星座，最後是片尾卡片。全片 2.35:1 黑邊、sRGB 調色與景深。

- 照片 3–500 張，由 Worker 池並行解碼並打包成縮圖圖集。
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
