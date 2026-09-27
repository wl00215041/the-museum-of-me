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
