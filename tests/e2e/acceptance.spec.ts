import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildSequence, localU, segmentIndexAt } from '../../src/plan/sequence';
import { fillSetup } from './helpers';

/** Seconds in the original film at which to compare (spread over the whole one take). */
const ANCHORS = [1.5, 10.5, 18.5, 23, 30, 46, 58, 70, 80, 98, 112, 124, 138, 155, 166, 185];

test('side-by-side comparison with the original film', async ({ page }) => {
  const original = process.env.ORIGINAL;
  test.skip(!original, 'set ORIGINAL=/path/to/the/original.mp4 to run the comparison');
  test.setTimeout(10 * 60_000);
  const out = path.resolve('test-results/compare');
  mkdirSync(out, { recursive: true });
  await fillSetup(page, { name: 'Tim Sparke', duration: 'auto', resolution: '720p' });
  const reference = buildSequence({ photoCount: 20, lengthMode: 'auto', musicDuration: null }); // photos 15 s, as in the original
  const ours = buildSequence({ photoCount: 5, lengthMode: 'auto', musicDuration: null });
  for (const [k, t] of ANCHORS.entries()) {
    const i = segmentIndexAt(reference, t);
    const u = localU(reference.segments[i], t);
    const segment = ours.segments.find((s) => s.id === reference.segments[i].id)!;
    await page.locator('#scrub').fill(String(segment.start + u * (segment.end - segment.start)));
    await page.locator('#viewport canvas').screenshot({ path: `${out}/ours-${k}.png` });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', original!, '-frames:v', '1', '-vf', 'scale=480:-2', `${out}/orig-${k}.png`]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/ours-${k}.png`, '-vf', 'scale=480:-2', `${out}/ours-s-${k}.png`]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/orig-${k}.png`, '-i', `${out}/ours-s-${k}.png`, '-filter_complex', '[0]pad=480:ih[a];[1]scale=480:-2[b];[a][b]vstack', `${out}/pair-${k}.png`]);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', `${out}/pair-%d.png`, '-vf', 'tile=4x4:padding=6:color=red', '-frames:v', '1', path.resolve('test-results/compare.png')]);
});
