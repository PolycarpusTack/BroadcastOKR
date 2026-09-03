import { describe, it, expect, vi, afterEach } from 'vitest';

// BRIDGE_URL is fixed at module load from the build edition, so each case
// stubs the env and re-imports a fresh module.
async function bridgeUrlFor(edition: string | undefined, explicit?: string): Promise<string> {
  vi.resetModules();
  if (edition === undefined) vi.stubEnv('VITE_EDITION', ''); else vi.stubEnv('VITE_EDITION', edition);
  if (explicit === undefined) vi.stubEnv('VITE_BRIDGE_URL', undefined as unknown as string); else vi.stubEnv('VITE_BRIDGE_URL', explicit);
  const mod = await import('../config');
  return mod.BRIDGE_URL;
}

describe('BRIDGE_URL default per edition', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('desktop keeps the local bridge port', async () => {
    expect(await bridgeUrlFor(undefined)).toBe('http://localhost:3001');
    expect(await bridgeUrlFor('desktop')).toBe('http://localhost:3001');
  });

  it('cloud editions are same-origin — the bridge serves the app', async () => {
    expect(await bridgeUrlFor('client')).toBe('');
    expect(await bridgeUrlFor('internal')).toBe('');
    expect(await bridgeUrlFor('cockpit')).toBe('');
  });

  it('VITE_BRIDGE_URL overrides every edition, including an explicit empty string', async () => {
    expect(await bridgeUrlFor('client', 'https://bridge.example')).toBe('https://bridge.example');
    expect(await bridgeUrlFor('desktop', '')).toBe('');
  });
});
