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

白牆開場：鏡頭朝右前方斜看「The Museum of Me」，一路等速平移、逐漸轉正，到「{NAME} EXHIBITION」與時間戳時與牆面平行 → Portraits → Photos（照片斜向堆疊）→ 暗房 Moments（燈箱）→ Words（LED 點陣字牆）→ Likes（低多邊形讚手勢雕塑）→ Videos（影像牆）→ 機器手臂與照片平台 → 馬賽克肖像 → 星座網絡 → 片尾卡片。全片為 2.35:1 黑邊、低飽和調色。

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
