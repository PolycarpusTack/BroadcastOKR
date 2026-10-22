import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const bridge = `http://127.0.0.1:${Number(process.env.E2E_BRIDGE_PORT) || 3001}`;

async function openGoals(page: Page) {
  await page.addInitScript(() => localStorage.setItem('brokr.setupWizard.v1', JSON.stringify({ dismissedAt: '2026-10-21' })));
  await page.goto('/#/goals');
  await expect(page).toHaveURL(/#\/goals$/);
  await expect(page.getByRole('status', { name: 'Bridge connected' })).toBeVisible();
}

async function createGoal(page: Page, title: string) {
  await page.getByRole('button', { name: '+ New Goal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /New Goal/ });
  await dialog.getByRole('textbox', { name: 'Goal title', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: 'Key result 1 title' }).fill('Verified readiness');
  await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  return page.getByRole('article', { name: `Goal: ${title}`, exact: true });
}

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${bridge}/api/sync/migrate-from-local`, { data: {
    users: [{ id: 0, name: 'Test Owner', role: 'owner', av: 'TO', color: '#123456', dept: '', title: '' }],
  } });
  expect(res.ok()).toBeTruthy();
});

test('creates and edits a goal that survives reload', async ({ page }) => {
  await openGoals(page);
  const title = `Persistent goal ${randomUUID()}`;
  const card = await createGoal(page, title);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit goal' }).click();
  const dialog = page.getByRole('dialog', { name: /Edit Goal/ });
  await dialog.getByRole('textbox', { name: 'Goal title', exact: true }).fill(`${title} edited`);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('article', { name: `Goal: ${title} edited`, exact: true })).toBeVisible();
});

test('keeps a refused creation editable and succeeds on retry', async ({ page }) => {
  await openGoals(page);
  await page.route('**/api/goals', async (route) => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 403, json: { error: 'Write refused for test' } });
    else await route.continue();
  });
  const title = `Retry goal ${randomUUID()}`;
  await page.getByRole('button', { name: '+ New Goal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /New Goal/ });
  await dialog.getByRole('textbox', { name: 'Goal title', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: 'Key result 1 title' }).fill('Readiness');
  await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Goal was not saved');
  await expect(dialog.getByRole('textbox', { name: 'Goal title', exact: true })).toHaveValue(title);
  await expect(page.getByRole('article', { name: `Goal: ${title}`, exact: true })).toHaveCount(0);
  await page.unroute('**/api/goals');
  await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('article', { name: `Goal: ${title}`, exact: true })).toBeVisible();
});

test('propagates a check-in and deletion to another browser within ten seconds', async ({ page, browser }) => {
  await openGoals(page);
  const title = `Shared goal ${randomUUID()}`;
  const card = await createGoal(page, title);
  const observerContext = await browser.newContext();
  try {
    const observer = await observerContext.newPage();
    await openGoals(observer);
    const observedCard = observer.getByRole('article', { name: `Goal: ${title}`, exact: true });
    await expect(observedCard).toBeVisible();
    await observedCard.getByText(title, { exact: true }).click();
    await card.getByText(title, { exact: true }).click();
    await card.getByRole('button', { name: 'Check In', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Check-in:/ });
    await dialog.getByRole('spinbutton', { name: 'Value', exact: true }).fill('75');
    const persisted = page.waitForResponse((res) => res.url().endsWith('/check-in') && res.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Record Check-in' }).click();
    expect((await persisted).ok()).toBeTruthy();
    await expect(observedCard).toContainText('75 / 100', { timeout: 10000 });
    await card.getByRole('button', { name: 'Delete Goal', exact: true }).click();
    await card.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(observedCard).toHaveCount(0, { timeout: 10000 });
  } finally {
    await observerContext.close();
  }
});

test('imports through the UI and retains the result after reload', async ({ page }) => {
  await openGoals(page);
  const title = `Imported goal ${randomUUID()}`;
  const imported = { id: `import-${randomUUID()}`, title, status: 'behind', progress: 0, owner: 0, channel: 0, period: 'Q4 2026',
    keyResults: [{ id: `kr-${randomUUID()}`, title: 'Imported result', start: 0, target: 100, current: 42, progress: 0.42, status: 'at_risk' }] };
  await page.getByRole('button', { name: 'Import or export data' }).click();
  const dialog = page.getByRole('dialog', { name: /Import \/ Export/ });
  await dialog.getByLabel('Upload file').setInputFiles({ name: 'goals.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ goals: [imported] })) });
  const saved = page.waitForResponse((res) => res.url().endsWith('/api/sync/import'));
  await dialog.getByRole('button', { name: 'Import 1 Items', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('article', { name: `Goal: ${title}`, exact: true })).toBeVisible();
});
