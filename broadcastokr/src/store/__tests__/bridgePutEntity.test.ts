import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bridgePutEntity } from '../bridgeSync';

function okResponse(version: number) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, version }),
    headers: new Headers(),
  } as unknown as Response;
}

function conflictResponse(current: unknown) {
  return {
    ok: false,
    status: 409,
    json: () => Promise.resolve({ error: 'version_conflict', current }),
    headers: new Headers(),
  } as unknown as Response;
}

describe('bridgePutEntity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the version from getVersion and applies the echoed bump', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(3));
    vi.stubGlobal('fetch', fetchMock);
    const onVersion = vi.fn();

    await bridgePutEntity('goals', { id: 'g1', title: 'X' }, {
      getVersion: () => 2,
      onVersion,
      onConflict: vi.fn(),
    });

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.version).toBe(2);
    expect(onVersion).toHaveBeenCalledWith(3);
  });

  it('routes a 409 to onConflict with the server row, without retrying', async () => {
    const current = { id: 'g1', title: 'Server wins', version: 5 };
    const fetchMock = vi.fn().mockResolvedValue(conflictResponse(current));
    vi.stubGlobal('fetch', fetchMock);
    const onConflict = vi.fn();

    await bridgePutEntity('goals', { id: 'g1', title: 'Mine' }, {
      getVersion: () => 1,
      onVersion: vi.fn(),
      onConflict,
    });

    expect(onConflict).toHaveBeenCalledWith(current);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes writes to the same entity so the second sends the bumped version', async () => {
    let liveVersion = 0;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      const sent = JSON.parse((init as RequestInit).body as string);
      liveVersion = sent.version + 1;
      return Promise.resolve(okResponse(liveVersion));
    });
    vi.stubGlobal('fetch', fetchMock);
    let known: number | undefined = 0;

    const hooks = {
      getVersion: () => known,
      onVersion: (v: number) => { known = v; },
      onConflict: vi.fn(),
    };
    const first = bridgePutEntity('tasks', { id: 't9', title: 'a' }, hooks);
    const second = bridgePutEntity('tasks', { id: 't9', title: 'b' }, hooks);
    await Promise.all([first, second]);

    const versions = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).version);
    expect(versions).toEqual([0, 1]);
    expect(known).toBe(2);
  });
});
