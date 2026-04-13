import { test, expect } from '@playwright/test';

test('can navigate to goals page', async ({ page }) => {
  await page.goto('/goals');
  await expect(page.locator('main')).toBeVisible();
});
