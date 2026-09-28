import { expect, test, type Page } from '@playwright/test';
import { buildStoryboard } from '../../src/plan/storyboard';
import type { ShotId } from '../../src/types';
import { fillSetup } from './helpers';

const KIND: Record<ShotId, 'white' | 'dark' | 'any'> = {
  title: 'white', intro: 'white', exhibition: 'white', portraits: 'white', photos: 'white',
  moments: 'dark', words: 'dark', likes: 'dark', videos: 'any', robots: 'white',
  mosaic: 'any', network: 'dark', ending: 'any',
};

/** Letterbox brightness and, inside the picture band, contrast and median luminance. */
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

test('every shot renders with the expected brightness inside a 2.35:1 letterbox', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const storyboard = buildStoryboard({ photoCount: 5, lengthMode: 'auto', musicDuration: null });
  expect(Number(await page.locator('#scrub').getAttribute('max'))).toBeCloseTo(storyboard.total, 6);
  for (const shot of storyboard.shots) {
    const stats = await frameStats(page, (shot.start + shot.end) / 2);
    await page.locator('#viewport canvas').screenshot({ path: test.info().outputPath(`shot-${shot.id}.png`) });
    expect(stats.barMax, `${shot.id} letterbox`).toBeLessThan(14);
    expect(stats.contrast, `${shot.id} contrast`).toBeGreaterThan(25);
    if (KIND[shot.id] === 'white') expect(stats.median, `${shot.id} should be a white room`).toBeGreaterThan(140);
    if (KIND[shot.id] === 'dark') expect(stats.median, `${shot.id} should be a dark room`).toBeLessThan(90);
  }
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
