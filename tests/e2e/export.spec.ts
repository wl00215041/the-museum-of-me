import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fillSetup } from './helpers';

const canvasWidth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.querySelector<HTMLCanvasElement>('#viewport canvas')!.width);

test('exports a 30-second 720p MP4 with H.264 video and AAC audio', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await fillSetup(page, { name: '測試', duration: '30', resolution: '720p' });
  const downloadPromise = page.waitForEvent('download', { timeout: 29 * 60_000 });
  await page.click('#export');
  await expect(page.locator('#export-panel')).toBeVisible();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^museum-of-測試-\d{8}\.mp4$/);
  const file = test.info().outputPath('museum.mp4');
  await download.saveAs(file);

  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).toString(),
  );
  const video = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const audio = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  expect(video.codec_name).toBe('h264');
  expect(video.width).toBe(1280);
  expect(video.height).toBe(720);
  expect(Number(video.nb_read_frames)).toBe(900);
  expect(audio.codec_name).toBe('aac');
  expect(Number(audio.sample_rate)).toBe(48000);
  expect(Math.abs(Number(probe.format.duration) - 30)).toBeLessThan(0.15);
  await expect(page.locator('#export-panel')).toBeHidden();
  await expect(page.locator('#stage-status')).toHaveText('匯出完成。');
});

test('cancelling an export restores the preview and re-enables exporting', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await fillSetup(page, { name: '測試', duration: '30', resolution: '1080p' });
  const previewWidth = await canvasWidth(page);
  await page.click('#export');
  await expect
    .poll(async () => Number(await page.locator('#export-progress').getAttribute('value')), { timeout: 5 * 60_000 })
    .toBeGreaterThan(0.02);
  expect(await canvasWidth(page)).toBe(1920);
  await page.click('#cancel-export');
  await expect(page.locator('#stage-status')).toHaveText('已取消匯出');
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#export-panel')).toBeHidden();
  expect(await canvasWidth(page)).toBe(previewWidth);
});
