import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ok = (cmd: string, args: string[]) => spawnSync(cmd, args).status === 0;
const ready = ok('ffmpeg', ['-version']) && ok('python3', ['-c', 'import cv2, numpy']);
const dir = mkdtempSync(path.join(tmpdir(), 'motion-'));
// A still with texture everywhere (blurred noise): the fixture photos are colour bars, which have no corners to track.
const still = path.join(dir, 'still.png');
if (ready) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', "nullsrc=s=2560x1440,geq=lum='random(1)*255':cb=128:cr=128,boxblur=4:1", '-frames:v', '1', still]);

function film(name: string, filter: string): string {
  const video = path.join(dir, name);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', still, '-t', '3', '-r', '30', '-vf', filter, '-pix_fmt', 'yuv420p', video]);
  return video;
}

function measure(video: string): { second: number; tx: number; zoom: number }[] {
  const out = `${video}.csv`;
  execFileSync('python3', ['scripts/measure-motion.py', video, out]);
  return readFileSync(out, 'utf8').trim().split('\n').slice(1).map((line) => {
    const [second, tx, , zoom] = line.split(',').map(Number);
    return { second, tx, zoom };
  });
}

// ffmpeg + OpenCV take a few seconds each, more on a busy machine.
describe.skipIf(!ready)('motion tools', { timeout: 60_000 }, () => {
  it('a window sliding right over a still reads as the picture moving left, with no zoom', () => {
    const rows = measure(film('pan.mp4', "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,crop=1280:720:'150*t':300"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows.filter((x) => x.second >= 1)) {
      expect(r.tx).toBeLessThan(-110);
      expect(r.tx).toBeGreaterThan(-190);
      expect(Math.abs(Math.log(r.zoom))).toBeLessThan(0.03);
    }
  });

  it('a zoom into a still reads as zoom above 1', () => {
    const rows = measure(film('zoom.mp4', "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,zoompan=z='1+0.004*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=30"));
    for (const r of rows.filter((x) => x.second >= 1)) expect(r.zoom).toBeGreaterThan(1.05);
  });

  it('compare-motion passes matching sections and fails opposite motion', () => {
    const csv = (rows: [number, number, number][]) =>
      'second,tx,ty,zoom,rot,inliers\n' + rows.map(([s, tx, z]) => `${s},${tx},0,${z},0,500`).join('\n') + '\n';
    const orig = path.join(dir, 'o.csv');
    const ours = path.join(dir, 'u.csv');
    const table = path.join(dir, 't.json');
    const report = path.join(dir, 'r.md');
    writeFileSync(orig, csv([[0, -140, 1], [1, -140, 1], [2, 50, 1.05], [3, 50, 1.05]]));
    writeFileSync(ours, csv([[0, -120, 1.01], [1, -150, 1], [2, -60, 0.95], [3, -60, 0.95]]));
    writeFileSync(table, JSON.stringify([{ name: 'truck', from: 0, to: 2 }, { name: 'orbit', from: 2, to: 4 }]));
    const run = spawnSync('python3', ['scripts/compare-motion.py', orig, ours, table, report]);
    expect(run.status).toBe(1);
    const md = readFileSync(report, 'utf8');
    expect(md).toMatch(/\| truck \|.*\| pass \|/);
    expect(md).toMatch(/\| orbit \|.*FAIL/);
  });
});
