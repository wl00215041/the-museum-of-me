import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;
const NAMES = ['photo-1.jpg', 'not-an-image.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg'];

test('maps scene photos through unreadable files', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto('/');
  await loadModule(page, '/src/app/project.ts', '__project');
  await loadModule(page, '/src/assets/photo-pool.ts', '__pool');
  const r = await page.evaluate(async (data) => {
    const w = window as AnyWindow;
    const files = data.map(([name, bytes]) => new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' }));
    const pool = w.__pool.createPhotoPool(2);
    const project = await w.__project.buildProject({
      photos: files, captions: files.map(() => ''), portraitIndex: 0, name: 'Tim', subtitle: '', date: '', keywords: [],
      durationMode: 'auto', resolution: '720p', musicStyle: 'calm', music: null,
      // Input indices: 4 = photo-4, 1 = the unreadable file, 2 = photo-2.
      scenes: { location: [4, 1, 2], videos: [3] },
    }, pool, () => {});
    const out = { location: project.gallery.location.boxes.map((b: { photoIndex: number }) => b.photoIndex), video: project.gallery.hall.videos.photoIndex };
    project.dispose();
    pool.dispose();
    return out;
  }, NAMES.map((n) => [n, b64(n)] as [string, string]));
  // The library holds photo-1, photo-2, photo-3, photo-4 at 0–3.
  expect(r.location).toEqual([3, 1]);
  expect(r.video).toBe(2);
});
