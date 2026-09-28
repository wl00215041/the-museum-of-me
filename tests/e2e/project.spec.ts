import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEFAULT_PHOTOS, fixture } from './helpers';

async function prepare(page: import('@playwright/test').Page, photos: { name: string; mimeType: string; buffer: Buffer }[] | string[]) {
  await page.goto('/');
  await page.setInputFiles('#photo-input', photos as never);
  await page.fill('#name', 'Tim Sparke');
  await page.selectOption('#resolution', '720p');
}

test('music length mode with an undecodable file reports an error', async ({ page }) => {
  await prepare(page, DEFAULT_PHOTOS.map(fixture));
  await page.selectOption('#music-style', 'upload');
  await page.setInputFiles('#music', { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio at all') });
  await page.selectOption('#duration', 'music');
  await page.click('#generate');
  await expect(page.locator('#setup-errors')).toContainText('無法讀取音樂檔', { timeout: 30_000 });
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#busy')).toBeHidden();
});

test('music length mode follows the uploaded music (clamped to 30 s)', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await prepare(page, DEFAULT_PHOTOS.map(fixture));
  await page.selectOption('#music-style', 'upload');
  await page.setInputFiles('#music', fixture('tone-5s.wav'));
  await page.selectOption('#duration', 'music');
  await page.click('#generate');
  await expect(page.locator('#stage')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#time')).toHaveText('0:00 / 0:30');
  await expect(page.locator('#stage-status')).toContainText('30 秒');
});

test('cancelling a large build returns to the form, and building again works', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const bytes = DEFAULT_PHOTOS.map((n) => readFileSync(fixture(n)));
  const many = Array.from({ length: 120 }, (_, i) => ({ name: `${i}.jpg`, mimeType: 'image/jpeg', buffer: bytes[i % bytes.length] }));
  await prepare(page, many);
  await page.click('#generate');
  await expect(page.locator('#busy')).toBeVisible();
  await page.click('#busy-cancel');
  await expect(page.locator('#busy')).toBeHidden();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
  await page.waitForTimeout(3000);
  await expect(page.locator('#stage')).toBeHidden();
  await page.click('#generate');
  await expect(page.locator('#stage')).toBeVisible({ timeout: 180_000 });
});
