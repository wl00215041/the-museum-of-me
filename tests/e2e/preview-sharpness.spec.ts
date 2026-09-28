import { expect, test } from '@playwright/test';
import { fillSetup } from './helpers';

// A high-DPI screen gets one rendered pixel per device pixel, so the preview is not stretched (and blurred) by the browser.
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

test('the preview renders at the screen\'s pixel density', async ({ page }) => {
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const r = await page.locator('#viewport canvas').evaluate((c: HTMLCanvasElement) => ({ css: c.clientWidth, px: c.width, dpr: devicePixelRatio }));
  expect(r.px).toBeGreaterThanOrEqual(Math.round(r.css * r.dpr) - 1);
});
