import { expect, test } from '@playwright/test';

test('the app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('The Museum of Me');
  await expect(page.locator('#setup-form')).toBeVisible();
});
