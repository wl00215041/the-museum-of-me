import { expect, test } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PHOTOS, fillSetup } from './helpers';

/** 20 photos: the auto timeline then matches the original's seconds (photos segment 15 s). */
const TWENTY = [...DEFAULT_PHOTOS, ...DEFAULT_PHOTOS, ...DEFAULT_PHOTOS, ...DEFAULT_PHOTOS];
const original = process.env.ORIGINAL;
const results = path.resolve('test-results');

test.describe('comparison with the original film', () => {
  test.skip(!original, 'set ORIGINAL=/path/to/the/original.mp4 to run the comparison');

  test('side by side every 2 s from 0 to 148 s', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const out = path.join(results, 'compare');
    mkdirSync(out, { recursive: true });
    await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p', photos: TWENTY });
    const times = Array.from({ length: 75 }, (_, i) => i * 2);
    for (const [k, t] of times.entries()) {
      await page.locator('#scrub').fill(String(t));
      await page.locator('#viewport canvas').screenshot({ path: `${out}/ours-${k}.png` });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', original!, '-frames:v', '1', '-vf', 'scale=480:-2', `${out}/orig-${k}.png`]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/orig-${k}.png`, '-i', `${out}/ours-${k}.png`, '-filter_complex', `[0]pad=480:ih,drawtext=text='${t}s':x=6:y=6:fontsize=20:fontcolor=red[a];[1]scale=480:-2[b];[a][b]vstack`, `${out}/pair-${k}.png`]);
    }
    for (let s = 0; s < 5; s++) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-start_number', String(s * 15), '-i', `${out}/pair-%d.png`, '-frames:v', '1', '-vf', 'tile=5x3:padding=6:color=red', path.join(results, `compare-${s + 1}.png`)]);
    }
    expect(existsSync(path.join(results, 'compare-5.png'))).toBe(true);
  });

  test('motion matches the original section by section', async ({ page }) => {
    test.setTimeout(60 * 60_000);
    await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p', photos: TWENTY });
    const download = page.waitForEvent('download', { timeout: 59 * 60_000 });
    await page.click('#export');
    const ours = path.join(results, 'ours.mp4');
    await (await download).saveAs(ours);
    const csv = (name: string) => path.join(results, `${name}-motion.csv`);
    execFileSync('python3', ['scripts/measure-motion.py', original!, csv('original'), '--end', '151']);
    execFileSync('python3', ['scripts/measure-motion.py', ours, csv('ours'), '--end', '151']);
    const report = path.join(results, 'motion.md');
    const run = spawnSync('python3', ['scripts/compare-motion.py', csv('original'), csv('ours'), 'scripts/original-motion.json', report]);
    expect(run.status, readFileSync(report, 'utf8')).toBe(0);
  });
});
