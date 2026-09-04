/**
 * Desktop update signal (R7-2). The desktop edition has no fleet operator
 * upgrading it, so it asks GitHub for the newest release once a day and says
 * so, passively, when a newer version exists. Nothing is downloaded.
 */

export const RELEASES_REPO = 'PolycarpusTack/BroadcastOKR';
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const LAST_CHECK_KEY = 'brokr.updateCheckedAt';

export interface LatestRelease {
  version: string;
  url: string;
}

/** `v1.2.3`, `1.2.3-rc1` → [1, 2, 3]; anything else → null. */
export function parseVersion(value: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function shouldCheckForUpdate(lastCheckedIso: string | null, now = Date.now()): boolean {
  if (!lastCheckedIso) return true;
  const last = new Date(lastCheckedIso).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= UPDATE_CHECK_INTERVAL_MS;
}

export async function fetchLatestRelease(
  repo = RELEASES_REPO,
  fetchImpl: typeof fetch = fetch,
): Promise<LatestRelease | null> {
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!body.tag_name || !parseVersion(body.tag_name)) return null;
    return { version: body.tag_name.replace(/^v/, ''), url: body.html_url ?? `https://github.com/${repo}/releases/latest` };
  } catch {
    return null;
  }
}

/**
 * One call for the app: honours the daily interval (persisted in localStorage),
 * returns the newer release or null. Storage access is wrapped — a blocked
 * storage must never break the app.
 */
export async function checkForNewerRelease(
  currentVersion: string,
  { storage = typeof localStorage !== 'undefined' ? localStorage : null, now = Date.now(), fetchImpl = fetch }:
    { storage?: Pick<Storage, 'getItem' | 'setItem'> | null; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<LatestRelease | null> {
  let last: string | null = null;
  try { last = storage?.getItem(LAST_CHECK_KEY) ?? null; } catch { /* storage blocked */ }
  if (!shouldCheckForUpdate(last, now)) return null;
  const latest = await fetchLatestRelease(RELEASES_REPO, fetchImpl);
  try { storage?.setItem(LAST_CHECK_KEY, new Date(now).toISOString()); } catch { /* storage blocked */ }
  if (!latest || !isNewerVersion(latest.version, currentVersion)) return null;
  return latest;
}
