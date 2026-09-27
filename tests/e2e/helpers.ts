import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const fixture = (name: string): string => path.resolve('tests/fixtures', name);

export const b64 = (name: string): string => readFileSync(fixture(name)).toString('base64');

/** Loads a Vite-served source module into the page and exposes it as window[key]. */
export async function loadModule(page: Page, modulePath: string, key: string): Promise<void> {
  await page.addScriptTag({ type: 'module', content: `import * as m from '${modulePath}'; window['${key}'] = m;` });
  await page.waitForFunction((k) => k in window, key);
}

export const DEFAULT_PHOTOS = ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg'];

export async function fillSetup(
  page: Page,
  opts: { name: string; duration: string; resolution: string; photos?: string[] },
): Promise<void> {
  await page.goto('/');
  await page.setInputFiles('#photo-input', (opts.photos ?? DEFAULT_PHOTOS).map(fixture));
  await page.fill('#name', opts.name);
  await page.fill('#keywords', '勇氣, 旅行, family, 2026');
  await page.selectOption('#duration', opts.duration);
  await page.selectOption('#resolution', opts.resolution);
  await page.click('#generate');
  await expect(page.locator('#stage')).toBeVisible({ timeout: 120_000 });
}
