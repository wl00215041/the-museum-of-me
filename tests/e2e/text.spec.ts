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
      concrete: (() => { const c = f.concrete(); return [c.image.width, c.wrapS]; })(),
    };
  });
  expect(r.lightbox).toEqual([520, 1120]);
  expect(r.bars).toEqual([640, 480]);
  expect(r.maskLength).toBe(8000);
  expect(r.lit).toBeGreaterThan(200);
  expect(r.serifAspect).toBeGreaterThan(3);
  expect(r.concrete).toEqual([1024, 1000]); // 1000 = THREE.RepeatWrapping
});
