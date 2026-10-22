import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bridgePost } from '../bridgeSync';

// Review 2026-10-22: a create whose response was lost was retried, met its own
// committed row as 409 duplicate, and was reported as a failure — the user's
// retry then created a second goal under a new id.

function duplicateResponse(current: unknown) {
  return {
    ok: false,
    status: 409,
    json: () => Promise.resolve({ error: 'duplicate', current }),
    headers: new Headers(),
  } as unknown as Response;
}

const row = { id: 'g-new', title: 'Saved on the first attempt', version: 1 };

describe('create retried after a lost response', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts the duplicate of its own earlier attempt as success', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(duplicateResponse(row));
    vi.stubGlobal('fetch', fetchMock);

    const pending = bridgePost('/api/goals', { id: 'g-new' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(row);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still refuses a duplicate on the first attempt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(duplicateResponse(row)));
    await expect(bridgePost('/api/goals', { id: 'g-new' })).rejects.toThrow('duplicate');
  });
});
