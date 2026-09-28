import { expect, test } from '@playwright/test';
import { b64, loadModule } from './helpers';

type AnyWindow = Window & Record<string, any>;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await loadModule(page, '/src/audio/soundtrack.ts', '__soundtrack');
});

test('synthesized soundtrack has the requested length, format and audible content', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const buf: AudioBuffer = await m.synthesizeSoundtrack(20, 7);
    const ch = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    return { duration: buf.duration, channels: buf.numberOfChannels, rate: buf.sampleRate, peak };
  });
  expect(r.duration).toBeCloseTo(20, 2);
  expect(r.channels).toBe(2);
  expect(r.rate).toBe(48000);
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.peak).toBeLessThanOrEqual(1);
});

test('uploaded music shorter than the video loops to fill it', async ({ page }) => {
  const r = await page.evaluate(async (data) => {
    const m = (window as AnyWindow).__soundtrack;
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' });
    const buf: AudioBuffer = await m.fitUploadedAudio(file, 12);
    const ch = buf.getChannelData(0);
    const rms = (from: number, to: number) => {
      let s = 0;
      const a = Math.floor(from * buf.sampleRate);
      const b = Math.floor(to * buf.sampleRate);
      for (let i = a; i < b; i++) s += ch[i] * ch[i];
      return Math.sqrt(s / (b - a));
    };
    return { duration: buf.duration, loopedRms: rms(6, 8) };
  }, b64('tone-5s.wav'));
  expect(r.duration).toBeCloseTo(12, 2);
  expect(r.loopedRms).toBeGreaterThan(0.01);
});

test('uploaded music longer than the video is trimmed and fades out', async ({ page }) => {
  const r = await page.evaluate(async (data) => {
    const m = (window as AnyWindow).__soundtrack;
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' });
    const buf: AudioBuffer = await m.fitUploadedAudio(file, 4);
    const ch = buf.getChannelData(0);
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += ch[i] * ch[i];
      return Math.sqrt(s / (b - a));
    };
    const sr = buf.sampleRate;
    return { duration: buf.duration, early: rms(Math.floor(0.6 * sr), Math.floor(0.9 * sr)), last: rms(ch.length - Math.floor(0.05 * sr), ch.length) };
  }, b64('tone-5s.wav'));
  expect(r.duration).toBeCloseTo(4, 2);
  expect(r.last).toBeLessThan(r.early * 0.2);
});

test('undecodable music falls back to the airy soundtrack with a warning', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const bad = new File(['definitely not audio'], 'song.mp3', { type: 'audio/mpeg' });
    const { buffer, warning } = await m.buildSoundtrack({ style: 'upload', file: bad }, 10, 1);
    return { duration: buffer.duration, warning };
  });
  expect(r.duration).toBeCloseTo(10, 2);
  expect(r.warning).toContain('內建配樂');
});

test('the airy style renders an audible soundtrack of the requested length', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const { buffer, warning } = await m.buildSoundtrack({ style: 'airy', file: null }, 16, 4);
    const ch = buffer.getChannelData(1);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    return { duration: buffer.duration, warning, peak };
  });
  expect(r.duration).toBeCloseTo(16, 2);
  expect(r.warning).toBeNull();
  expect(r.peak).toBeGreaterThan(0.05);
});

test('probeAudioDuration reads the length of uploaded music', async ({ page }) => {
  const seconds = await page.evaluate(async (data) => {
    const m = (window as AnyWindow).__soundtrack;
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'tone.wav', { type: 'audio/wav' });
    return m.probeAudioDuration(file);
  }, b64('tone-5s.wav'));
  expect(seconds).toBeCloseTo(5, 1);
});

test('synthesizes a 137 s airy soundtrack within 6 s', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await page.evaluate(async () => {
    const m = (window as AnyWindow).__soundtrack;
    const started = performance.now();
    const buf: AudioBuffer = await m.synthesizeSoundtrack(137, 11, 'airy');
    const ms = performance.now() - started;
    const ch = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]));
    return { ms, duration: buf.duration, peak };
  });
  expect(r.duration).toBeCloseTo(137, 2);
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.peak).toBeLessThan(1);
  expect(r.ms).toBeLessThan(6000);
});
