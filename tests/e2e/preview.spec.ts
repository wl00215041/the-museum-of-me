import { expect, test, type Page } from '@playwright/test';
import { buildSequence, requireSegment } from '../../src/plan/sequence';
import type { SegmentId } from '../../src/types';
import { fillSetup } from './helpers';

const KIND: Record<SegmentId, 'white' | 'dark' | 'black' | 'any'> = {
  title: 'white', exhibition: 'white', intro: 'white', portraits: 'white', photos: 'white',
  moments: 'dark', words: 'dark', likes: 'dark', videos: 'dark', robots: 'white',
  dive: 'any', mosaic: 'any', network: 'black', ending: 'any',
};

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
    const mean = band.reduce((a, b) => a + b, 0) / band.length;
    band.sort((a, b) => a - b);
    return { barMax, contrast: band[band.length - 1] - band[0], median: band[Math.floor(band.length / 2)], mean };
  });
}

const sequenceFor = () => buildSequence({ photoCount: 5, lengthMode: 'auto', musicDuration: null });

test('every segment renders with the expected brightness inside a 2.35:1 letterbox', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const sequence = sequenceFor();
  expect(Number(await page.locator('#scrub').getAttribute('max'))).toBeCloseTo(sequence.total, 6);
  for (const segment of sequence.segments) {
    const stats = await frameStats(page, (segment.start + segment.end) / 2);
    await page.locator('#viewport canvas').screenshot({ path: test.info().outputPath(`seg-${segment.id}.png`) });
    expect(stats.barMax, `${segment.id} letterbox`).toBeLessThan(14);
    expect(stats.contrast, `${segment.id} contrast`).toBeGreaterThan(20);
    const kind = KIND[segment.id];
    if (kind === 'white') expect(stats.median, `${segment.id} white room`).toBeGreaterThan(120);
    if (kind === 'dark') expect(stats.median, `${segment.id} dark room`).toBeLessThan(70);
    if (kind === 'black') expect(stats.median, `${segment.id} black space`).toBeLessThan(20);
  }
  expect(errors).toEqual([]);
});

test('the walk is one take: no sudden change of the whole picture between rooms', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const sequence = sequenceFor();
  const roomStarts = (['portraits', 'photos', 'moments', 'words', 'likes', 'videos', 'robots'] as const).map((id) => requireSegment(sequence, id).start);
  const end = requireSegment(sequence, 'network').end - 3;
  let previous: number | null = null;
  const jumps: string[] = [];
  for (let t = 1.5; t < end; t += 0.5) {
    // Mean, not median: the median of a bright shape shrinking on black flips as coverage crosses 50%, even when the picture is continuous.
    const { mean } = await frameStats(page, t);
    const nearBoundary = roomStarts.some((s) => Math.abs(t - s) < 1.3);
    if (previous !== null && !nearBoundary && Math.abs(mean - previous) >= 60) jumps.push(`t=${t}: ${previous} → ${mean}`);
    previous = mean;
  }
  expect(jumps).toEqual([]);
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
