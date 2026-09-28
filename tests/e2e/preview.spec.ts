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
  await expect(page.locator('.photo-tile')).toHaveCount(5);
});
