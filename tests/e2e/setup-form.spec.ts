import { expect, test, type Page } from '@playwright/test';
import { fixture, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;
const tiles = (page: Page) => page.locator('.photo-tile');
const tileNames = (page: Page) => tiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).title));
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('generate stays disabled until 3 photos and a name are provided', async ({ page }) => {
  await page.goto('/');
  const generate = page.locator('#generate');
  await page.setInputFiles('#photo-input', [fixture('photo-1.jpg'), fixture('photo-2.jpg')]);
  await expect(tiles(page)).toHaveCount(2);
  await expect(generate).toBeDisabled();
  await expect(page.locator('#setup-errors')).toContainText('請至少選擇 3 張照片');
  await page.setInputFiles('#photo-input', [fixture('photo-3.jpg')]);
  await expect(page.locator('#photo-count')).toHaveText('3 / 500 張');
  await page.fill('#name', '小明');
  await expect(generate).toBeEnabled();
});

test('tiles can be selected, reordered, removed and set as the portrait', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  await expect(tiles(page).nth(0).locator('.badge')).toHaveText('主視覺');
  await tiles(page).nth(0).click();
  await expect(page.locator('#photo-detail')).toBeVisible();
  await expect(page.locator('#detail-index')).toContainText('No. 001');
  await page.click('#detail-right');
  expect(await tileNames(page)).toEqual(['photo-2.jpg', 'photo-1.jpg', 'photo-3.jpg']);
  await expect(tiles(page).nth(1).locator('.badge')).toHaveText('主視覺');
  await tiles(page).nth(2).click();
  await page.click('#detail-portrait');
  await expect(tiles(page).nth(2).locator('.badge')).toHaveText('主視覺');
  await expect(tiles(page).nth(1).locator('.badge')).toHaveCount(0);
  await page.click('#detail-remove');
  await expect(tiles(page)).toHaveCount(2);
  await expect(tiles(page).nth(0).locator('.badge')).toHaveText('主視覺');
});

test('previews are drawn by the worker pool', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', ['photo-4.jpg', 'photo-5.jpg', 'photo-1.jpg'].map(fixture));
  await expect
    .poll(() => tiles(page).nth(0).locator('canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(60, 45, 1, 1).data;
      return d[3];
    }))
    .toBe(255);
});

test('submitting hands the parsed form values to the callback', async ({ page }) => {
  await page.goto('/');
  // Re-mount the form on a listener-free copy of #setup so the test owns the submit callback.
  await page.evaluate(() => {
    const old = document.getElementById('setup')!;
    old.replaceWith(old.cloneNode(true));
  });
  await loadModule(page, '/src/ui/setup-form.ts', '__form');
  await loadModule(page, '/src/assets/photo-pool.ts', '__pool');
  await page.evaluate(() => {
    const w = window as AnyWindow;
    w.__form.mountSetupForm(document.getElementById('setup'), w.__pool.createPhotoPool(2), (input: any) => {
      w.__submitted = { ...input, photos: input.photos.map((f: File) => f.name), music: input.music?.name ?? null };
    });
  });
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  await tiles(page).nth(2).click();
  await page.click('#detail-portrait');
  await tiles(page).nth(0).click();
  await page.fill('#detail-caption', '第一天');
  await page.fill('#name', ' 小明 ');
  await page.fill('#keywords', '勇氣，旅行\n勇氣');
  await page.selectOption('#duration', '60');
  await page.selectOption('#resolution', '720p');
  await page.selectOption('#music-style', 'calm');
  await page.click('#generate');
  const input = await (await page.waitForFunction(() => (window as AnyWindow).__submitted)).jsonValue();
  expect(input).toMatchObject({
    photos: ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'],
    captions: ['第一天', '', ''],
    portraitIndex: 2,
    name: '小明',
    keywords: ['勇氣', '旅行'],
    durationMode: 60,
    resolution: '720p',
    musicStyle: 'calm',
    music: null,
  });
});

test('music length mode is only available after uploading music', async ({ page }) => {
  await page.goto('/');
  const option = page.locator('#duration option[value="music"]');
  await expect(option).toHaveJSProperty('disabled', true);
  await expect(page.locator('#music-upload')).toBeHidden();
  await page.selectOption('#music-style', 'upload');
  await expect(page.locator('#music-upload')).toBeVisible();
  await expect(option).toHaveJSProperty('disabled', true);
  await page.setInputFiles('#music', fixture('tone-5s.wav'));
  await expect(option).toHaveJSProperty('disabled', false);
  await page.selectOption('#duration', 'music');
  await page.selectOption('#music-style', 'airy');
  await expect(page.locator('#duration')).toHaveValue('auto');
  await expect(option).toHaveJSProperty('disabled', true);
});

test('caps the library at 500 photos', async ({ page }) => {
  await page.goto('/');
  const files = Array.from({ length: 505 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: TINY_PNG }));
  await page.setInputFiles('#photo-input', files);
  await expect(page.locator('#photo-count')).toHaveText('500 / 500 張');
  await expect(page.locator('#setup-notice')).toContainText('已略過 5 張');
});
