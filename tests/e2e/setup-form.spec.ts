import { expect, test } from '@playwright/test';
import { fixture, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;

const srcs = (page: import('@playwright/test').Page) =>
  page.locator('.photo-item img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));

test('generate stays disabled until 3 photos and a name are provided', async ({ page }) => {
  await page.goto('/');
  const generate = page.locator('#generate');
  await page.setInputFiles('#photo-input', [fixture('photo-1.jpg'), fixture('photo-2.jpg')]);
  await expect(page.locator('.photo-item')).toHaveCount(2);
  await expect(generate).toBeDisabled();
  await expect(page.locator('#setup-errors')).toContainText('請至少選擇 3 張照片');
  await page.setInputFiles('#photo-input', [fixture('photo-3.jpg')]);
  await expect(page.locator('.photo-item')).toHaveCount(3);
  await expect(generate).toBeDisabled();
  await page.fill('#name', '小明');
  await expect(generate).toBeEnabled();
});

test('photos can be reordered and removed; the first photo is the default portrait', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  const items = page.locator('.photo-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('input[type=radio]')).toBeChecked();
  const before = await srcs(page);
  await items.nth(0).locator('.move-down').click();
  expect(await srcs(page)).toEqual([before[1], before[0], before[2]]);
  await expect(items.nth(1).locator('input[type=radio]')).toBeChecked();
  await expect(items.nth(0).locator('.idx')).toHaveText('No. 01');
  await items.nth(2).locator('.remove').click();
  await expect(items).toHaveCount(2);
});

test('submitting hands the parsed form values to the callback', async ({ page }) => {
  await page.goto('/');
  // Re-mount the form on a listener-free copy of #setup so the test owns the submit callback
  // (main.ts changes in later tasks and must not affect this test).
  await page.evaluate(() => {
    const old = document.getElementById('setup')!;
    old.replaceWith(old.cloneNode(true));
  });
  await loadModule(page, '/src/ui/setup-form.ts', '__form');
  await page.evaluate(() => {
    const w = window as AnyWindow;
    w.__form.mountSetupForm(document.getElementById('setup'), (input: any) => {
      w.__submitted = { ...input, photos: input.photos.map((f: File) => f.name), music: input.music?.name ?? null };
    });
  });
  await page.setInputFiles('#photo-input', ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'].map(fixture));
  await page.locator('.photo-item').nth(2).locator('input[type=radio]').check();
  await page.locator('.photo-item').nth(0).locator('.caption').fill('第一天');
  await page.fill('#name', ' 小明 ');
  await page.fill('#keywords', '勇氣，旅行\n勇氣');
  await page.selectOption('#duration', '60');
  await page.selectOption('#resolution', '720p');
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
    music: null,
  });
});
