import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;
const NAMES = ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg', 'photo-rotated.jpg', 'photo-large.jpg', 'not-an-image.jpg'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/assets/library.ts', '__library');
  await loadModule(page, '/src/assets/photo-pool.ts', '__pool');
  await page.evaluate((data) => {
    const w = window as AnyWindow;
    // "12-photo-3.jpg" → bytes of photo-3.jpg, so tests can build many distinct files cheaply.
    w.__files = (names: string[]) =>
      names.map((name) => new File([Uint8Array.from(atob(data[name.replace(/^\d+-/, '')]), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' }));
  }, Object.fromEntries(NAMES.map((n) => [n, b64(n)])));
});

test('decodes in workers, honours EXIF orientation and reports undecodable files', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const progress: number[] = [];
    const { library, failed } = await w.__library.loadLibrary(
      w.__files(['photo-1.jpg', 'photo-rotated.jpg', 'not-an-image.jpg', 'photo-large.jpg']), pool, (done: number) => progress.push(done));
    const out = {
      count: library.count, failed, sources: library.sourceIndices, aspects: library.aspects,
      atlases: library.atlases.length, atlasWidth: library.atlases[0].image.width, lastProgress: progress.at(-1),
      colorsInRange: library.colors.every((c: number[]) => c.every((v) => v >= 0 && v <= 1)),
    };
    pool.dispose();
    return out;
  });
  expect(r).toMatchObject({ count: 3, failed: ['not-an-image.jpg'], sources: [0, 1, 3], atlases: 1, atlasWidth: 4096, lastProgress: 4, colorsInRange: true });
  expect(r.aspects[1]).toBeCloseTo(800 / 1200, 2);
});

test('loads high-resolution versions only for the requested photos', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const files = w.__files(['photo-1.jpg', 'photo-2.jpg', 'photo-large.jpg']);
    const { library } = await w.__library.loadLibrary(files, pool);
    await w.__library.loadHires(library, files, [2], pool);
    const tex = library.hires.get(2);
    const out = { size: library.hires.size, width: tex.image.width, height: tex.image.height };
    pool.dispose();
    return out;
  });
  expect(r).toEqual({ size: 1, width: 1600, height: 1200 });
});

test('handles 300 photos across two atlases within the time budget', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool();
    const names = Array.from({ length: 300 }, (_, i) => `${i}-photo-${(i % 5) + 1}.jpg`);
    const started = performance.now();
    const { library, failed } = await w.__library.loadLibrary(w.__files(names), pool);
    const out = { count: library.count, failed: failed.length, atlases: library.atlases.length, ms: performance.now() - started, workers: pool.size };
    pool.dispose();
    return out;
  });
  expect(r).toMatchObject({ count: 300, failed: 0, atlases: 2 });
  expect(r.workers).toBeGreaterThanOrEqual(2);
  expect(r.ms).toBeLessThan(30_000);
});

test('computes a portrait colour grid, mosaic assignment and LED dots in the worker', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const [file] = w.__files(['photo-2.jpg']);
    const grid: Float32Array = await pool.grid(file, 64, 36);
    const assignment: Int32Array = await pool.mosaic(grid, new Float32Array([0, 0, 0, 1, 1, 1, 0.5, 0.2, 0.2]), 7);
    const mask = new Uint8Array(40 * 10);
    for (let i = 0; i < mask.length; i += 3) mask[i] = 255;
    const led: ImageBitmap = await pool.led(mask, 40, 10, 6);
    const out = {
      gridLength: grid.length, gridInRange: Array.from(grid).every((v) => v >= 0 && v <= 1),
      assignmentLength: assignment.length, assignmentMax: Math.max(...assignment), ledSize: [led.width, led.height],
    };
    pool.dispose();
    return out;
  });
  expect(r).toEqual({ gridLength: 64 * 36 * 3, gridInRange: true, assignmentLength: 64 * 36, assignmentMax: r.assignmentMax, ledSize: [240, 60] });
  expect(r.assignmentMax).toBeLessThan(3);
});

test('disposing the pool rejects pending work', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as AnyWindow;
    const pool = w.__pool.createPhotoPool(2);
    const jobs = w.__files(Array.from({ length: 30 }, (_, i) => `${i}-photo-large.jpg`)).map((f: File) => pool.thumb(f, 256));
    pool.dispose();
    const settled = await Promise.allSettled(jobs);
    return { rejected: settled.filter((s) => s.status === 'rejected').length, reason: String((settled[0] as PromiseRejectedResult).reason) };
  });
  expect(r.rejected).toBe(30);
  expect(r.reason).toContain('disposed');
});
