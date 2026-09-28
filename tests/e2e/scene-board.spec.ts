import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PHOTOS, fixture } from './helpers';

const scene = (page: Page, id: string) => page.locator(`.scene[data-scene="${id}"]`);
const names = (page: Page, id: string) => scene(page, id).locator('.scene-tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).title));
const libraryTile = (page: Page, name: string) => page.locator(`.photo-tile[title="${name}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#photo-input', DEFAULT_PHOTOS.map(fixture));
  await expect(page.locator('.photo-tile')).toHaveCount(5);
});

test('fills every scene with the default choice after upload', async ({ page }) => {
  await expect(scene(page, 'photos').locator('.scene-tile')).toHaveCount(5);
  await expect(scene(page, 'friends').locator('.count')).toHaveText('5 / 12');
  expect(await names(page, 'location')).toEqual(['photo-1.jpg', 'photo-3.jpg', 'photo-4.jpg']);
  await expect(scene(page, 'videos').locator('.count')).toHaveText('1 / 1');
});

test('drag adds, × removes, a full scene refuses, dragging inside a scene reorders', async ({ page }) => {
  const location = scene(page, 'location');
  await location.locator('.scene-tile[title="photo-1.jpg"] .remove').click();
  expect(await names(page, 'location')).toEqual(['photo-3.jpg', 'photo-4.jpg']);
  await libraryTile(page, 'photo-5.jpg').dragTo(location);
  expect(await names(page, 'location')).toEqual(['photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
  await libraryTile(page, 'photo-2.jpg').dragTo(location);
  await expect(location.locator('.scene-msg')).toHaveText('已達上限 3 張');
  expect(await names(page, 'location')).toEqual(['photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
  await location.locator('.scene-tile[title="photo-5.jpg"]').dragTo(location.locator('.scene-tile[title="photo-3.jpg"]'));
  expect(await names(page, 'location')).toEqual(['photo-5.jpg', 'photo-3.jpg', 'photo-4.jpg']);
});

test('a photo can be in several scenes but not twice in one', async ({ page }) => {
  await libraryTile(page, 'photo-1.jpg').dragTo(scene(page, 'friends'));
  await expect(scene(page, 'friends').locator('.scene-tile')).toHaveCount(5);
  await expect(page.locator('.scene-tile[title="photo-1.jpg"]')).not.toHaveCount(0);
  expect((await names(page, 'photos')).includes('photo-1.jpg') && (await names(page, 'friends')).includes('photo-1.jpg')).toBe(true);
});

test('deleting a photo removes it from every scene', async ({ page }) => {
  const video = (await names(page, 'videos'))[0];
  await libraryTile(page, video).click();
  await page.click('#detail-remove');
  await expect(page.locator(`.scene-tile[title="${video}"]`)).toHaveCount(0);
  await expect(page.locator('.photo-tile')).toHaveCount(4);
  // An edited scene that loses its only photo stays empty and says so.
  const videos = scene(page, 'videos');
  await videos.locator('.remove').click();
  await libraryTile(page, 'photo-2.jpg').dragTo(videos);
  expect(await names(page, 'videos')).toEqual(['photo-2.jpg']);
  await libraryTile(page, 'photo-2.jpg').click();
  await page.click('#detail-remove');
  await expect(videos.locator('.scene-tile')).toHaveCount(0);
  await expect(videos.locator('.empty')).toHaveText('空：產生影片時自動補上');
});

test('reordering the library keeps an edited scene as it is', async ({ page }) => {
  await scene(page, 'location').locator('.scene-tile[title="photo-1.jpg"] .remove').click();
  const before = await names(page, 'location');
  await libraryTile(page, 'photo-2.jpg').click();
  await page.click('#detail-right');
  expect(await names(page, 'location')).toEqual(before);
});

test('an emptied scene says it will be filled automatically; restore defaults refills it', async ({ page }) => {
  await scene(page, 'videos').locator('.remove').click();
  await expect(scene(page, 'videos').locator('.empty')).toHaveText('空：產生影片時自動補上');
  await page.click('#scene-reset');
  await expect(scene(page, 'videos').locator('.scene-tile')).toHaveCount(1);
});

test('scenes not in the chosen length are greyed out', async ({ page }) => {
  await page.selectOption('#duration', '30');
  for (const id of ['friends', 'location', 'tvs', 'grid', 'videos']) {
    await expect(scene(page, id)).toHaveClass(/unavailable/);
    await expect(scene(page, id).locator('.note')).toHaveText('此長度不會出現');
  }
  for (const id of ['photos', 'floaters']) await expect(scene(page, id)).not.toHaveClass(/unavailable/);
  await page.selectOption('#duration', 'auto');
  await expect(page.locator('.scene.unavailable')).toHaveCount(0);
});

test('music length mode greys out nothing', async ({ page }) => {
  await page.selectOption('#music-style', 'upload');
  await page.setInputFiles('#music', fixture('tone-5s.wav'));
  await page.selectOption('#duration', 'music');
  await expect(page.locator('.scene.unavailable')).toHaveCount(0);
});
