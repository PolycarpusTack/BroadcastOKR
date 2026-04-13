import { test, expect } from '@playwright/test';

test('bridge health endpoint returns ok', async ({ request }) => {
  const response = await request.get('http://localhost:3001/api/health');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe('ok');
  expect(body.drivers).toBeDefined();
  expect(body.uptime).toBeGreaterThanOrEqual(0);
});

test('app loads and shows dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator('main')).toBeVisible();
});

test('connection indicator is visible', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('[role="status"]')).toBeVisible();
});
