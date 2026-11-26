import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// B-6 (F4, F6) on the local rig: two authenticated cloud sessions — an owner and a
// member — on a client-mode instance with real Keycloak OIDC. The member's check-in
// and the owner's deletion must reach the other session within ten seconds, persist
// across a reload, and a member's delete stays refused. Local, no container: the
// instance runs natively, not from the image (that part of A-4 stays open).

const OWNER = { user: process.env.RIG_OWNER_USER || 'owner', pass: process.env.RIG_OWNER_PASS || 'owner' };
const MEMBER = { user: process.env.RIG_MEMBER_USER || 'member', pass: process.env.RIG_MEMBER_PASS || 'member' };
const BOUND_MS = 10000;

async function signIn(browser: Browser, who: { user: string; pass: string }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('brokr.setupWizard.v1', JSON.stringify({ dismissedAt: '2026-11-26' })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with SSO' }).click();
  await page.locator('#username').fill(who.user);
  await page.locator('#password').fill(who.pass);
  await page.locator('#kc-login').click();
  await page.waitForURL((u) => !u.href.includes('/realms/'));
  const me = await page.request.get('/api/auth/me');
  expect(me.ok(), `${who.user} signed in`).toBeTruthy();
  // After the callback the app lands on '/' and routes itself to the dashboard once
  // the session resolves; navigate only after that, or the late redirect wins.
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByRole('status', { name: 'Bridge connected' })).toBeVisible();
  await page.goto('/#/goals');
  await expect(page).toHaveURL(/#\/goals$/);
  await expect(page.getByRole('button', { name: '+ New Goal', exact: true }).or(page.getByRole('article')).first()).toBeVisible();
  return { ctx, page };
}

test('member check-in and owner deletion converge across two SSO sessions within ten seconds', async ({ browser }) => {
  const owner = await signIn(browser, OWNER);
  const member = await signIn(browser, MEMBER);
  try {
    expect((await (await owner.page.request.get('/api/auth/me')).json()).role).toBe('owner');
    // A long-lived rig may have promoted the member; the owner puts the role back (roles are read live per request)
    const meMember = await (await member.page.request.get('/api/auth/me')).json();
    if (meMember.role !== 'member') {
      const id = meMember.user.id;
      const row = (await (await owner.page.request.get('/api/users')).json()).find((u: { id: number }) => u.id === id);
      const put = await owner.page.request.put(`/api/users/${id}`, { data: { ...row, role: 'member' } });
      expect(put.ok(), `demote rig member → ${put.status()}`).toBeTruthy();
    }
    const meMemberNow = await (await member.page.request.get('/api/auth/me')).json();
    expect(meMemberNow.role).toBe('member');
    const meMemberName = meMemberNow.user.name;

    // Owner creates a goal with a manual KR
    const title = `B-6 shared goal ${randomUUID()}`;
    await owner.page.getByRole('button', { name: '+ New Goal', exact: true }).click();
    const form = owner.page.getByRole('dialog', { name: /New Goal/ });
    await form.getByRole('textbox', { name: 'Goal title', exact: true }).fill(title);
    await form.getByRole('textbox', { name: 'Key result 1 title' }).fill('Two-session readiness');
    await form.getByRole('button', { name: 'Create Goal', exact: true }).click();
    await expect(form).not.toBeVisible();
    const ownerCard = owner.page.getByRole('article', { name: `Goal: ${title}`, exact: true });
    await expect(ownerCard).toBeVisible();

    // The member sees it through the change poll, then checks in
    const memberCard = member.page.getByRole('article', { name: `Goal: ${title}`, exact: true });
    await expect(memberCard).toBeVisible({ timeout: BOUND_MS });
    await memberCard.getByText(title, { exact: true }).click();
    await ownerCard.getByText(title, { exact: true }).click();
    await memberCard.getByRole('button', { name: 'Check In', exact: true }).click();
    const checkIn = member.page.getByRole('dialog', { name: /Check-in:/ });
    await checkIn.getByRole('spinbutton', { name: 'Value', exact: true }).fill('75');
    const persisted = member.page.waitForResponse((r) => r.url().endsWith('/check-in') && r.request().method() === 'POST');
    const t0 = Date.now();
    await checkIn.getByRole('button', { name: 'Record Check-in' }).click();
    const res = await persisted;
    expect(res.ok(), `member check-in → ${res.status()}`).toBeTruthy();
    await expect(ownerCard).toContainText('75 / 100', { timeout: BOUND_MS });
    const checkInMs = Date.now() - t0;

    // Attributed to the member's session, and it survives a reload on the owner's side
    const goalId = decodeURIComponent(new URL(res.url()).pathname.split('/')[3]);
    const stored = await (await owner.page.request.get(`/api/goals/${encodeURIComponent(goalId)}`)).json();
    const last = stored.keyResults[0].history.at(-1);
    expect([last.value, last.source]).toEqual([75, 'check-in']);
    expect(last.actor).toBe(meMemberName);
    await owner.page.reload();
    const reloaded = owner.page.getByRole('article', { name: `Goal: ${title}`, exact: true });
    await reloaded.getByText(title, { exact: true }).click();
    await expect(reloaded).toContainText('75 / 100');

    // A member's delete stays refused, and changes nothing
    const denied = await member.page.request.delete(`/api/goals/${encodeURIComponent(goalId)}`);
    expect(denied.status()).toBe(403);
    expect((await owner.page.request.get(`/api/goals/${encodeURIComponent(goalId)}`)).ok()).toBeTruthy();

    // Owner deletes; the member's card disappears within the bound
    const ownerCardAfter = owner.page.getByRole('article', { name: `Goal: ${title}`, exact: true }); // still expanded from the reload check
    const t1 = Date.now();
    await ownerCardAfter.getByRole('button', { name: 'Delete Goal', exact: true }).click();
    await ownerCardAfter.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(memberCard).toHaveCount(0, { timeout: BOUND_MS });
    const deleteMs = Date.now() - t1;

    test.info().annotations.push({ type: 'convergence', description: `check-in ${checkInMs} ms, deletion ${deleteMs} ms` });
    console.log(`B-6 convergence: check-in ${checkInMs} ms, deletion ${deleteMs} ms`);
  } finally {
    await owner.ctx.close();
    await member.ctx.close();
  }
});
