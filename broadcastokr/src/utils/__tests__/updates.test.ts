import { describe, it, expect } from 'vitest';
import { isNewerVersion, parseVersion, shouldCheckForUpdate, fetchLatestRelease, checkForNewerRelease, UPDATE_CHECK_INTERVAL_MS, LAST_CHECK_KEY } from '../updates';

const okFetch = (tag: string) => (async () => ({ ok: true, json: async () => ({ tag_name: tag, html_url: `https://example/${tag}` }) })) as unknown as typeof fetch;

describe('updates', () => {
  it('compares versions numerically, tolerating a v prefix and a suffix', () => {
    expect(parseVersion('v0.9.2')).toEqual([0, 9, 2]);
    expect(parseVersion('0.10.0-rc1')).toEqual([0, 10, 0]);
    expect(parseVersion('latest')).toBeNull();
    expect(isNewerVersion('v0.9.2', '0.9.1')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.9.1', '0.9.1')).toBe(false);
    expect(isNewerVersion('0.9.0', '0.9.1')).toBe(false);
    expect(isNewerVersion('garbage', '0.9.1')).toBe(false);
  });

  it('checks once a day, and always when it never checked or the stamp is unreadable', () => {
    const now = Date.parse('2026-09-04T12:00:00Z');
    expect(shouldCheckForUpdate(null, now)).toBe(true);
    expect(shouldCheckForUpdate('not a date', now)).toBe(true);
    expect(shouldCheckForUpdate(new Date(now - UPDATE_CHECK_INTERVAL_MS + 1000).toISOString(), now)).toBe(false);
    expect(shouldCheckForUpdate(new Date(now - UPDATE_CHECK_INTERVAL_MS).toISOString(), now)).toBe(true);
  });

  it('reads the latest release tag and swallows failures', async () => {
    expect(await fetchLatestRelease('o/r', okFetch('v0.9.2'))).toEqual({ version: '0.9.2', url: 'https://example/v0.9.2' });
    expect(await fetchLatestRelease('o/r', (async () => ({ ok: false })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchLatestRelease('o/r', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
    expect(await fetchLatestRelease('o/r', okFetch('nightly'))).toBeNull();
  });

  it('reports a newer release once per interval and records the check', async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const now = Date.parse('2026-09-04T12:00:00Z');
    expect(await checkForNewerRelease('0.9.1', { storage, now, fetchImpl: okFetch('v0.9.2') })).toEqual({ version: '0.9.2', url: 'https://example/v0.9.2' });
    expect(store.get(LAST_CHECK_KEY)).toBe(new Date(now).toISOString());
    // Within the interval: no network, no result
    expect(await checkForNewerRelease('0.9.1', { storage, now: now + 1000, fetchImpl: (async () => { throw new Error('must not be called'); }) as unknown as typeof fetch })).toBeNull();
    // Same version: nothing to say
    store.clear();
    expect(await checkForNewerRelease('0.9.2', { storage, now, fetchImpl: okFetch('v0.9.2') })).toBeNull();
  });
});
