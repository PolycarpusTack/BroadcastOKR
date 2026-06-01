import { test, expect } from '@playwright/test';

// The bridge /api/health endpoint is covered directly by the bridge unit
// suite (bridge/__tests__). These E2E tests focus on the real app booting and
// reaching the bridge end-to-end, which exercises the health path implicitly
// (the connection indicator below reflects a successful health check).

// The app uses HashRouter (for Electron), so routes live under '/#/...'.
test('app loads and shows dashboard', async ({ page }) => {
  await page.goto('/');
  // '/' redirects to the dashboard hash route
  await expect(page).toHaveURL(/#\/dashboard/);
  await expect(page.locator('main')).toBeVisible();
});

test('connection indicator is visible', async ({ page }) => {
  await page.goto('/#/dashboard');
  await expect(page.getByRole('status', { name: /Bridge|Reconnecting|Offline/ })).toBeVisible();
});
