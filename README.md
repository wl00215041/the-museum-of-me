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
