import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Ports are overridable so the suite can avoid collisions with other local
// dev servers. CI uses the defaults on a clean runner.
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 5173;
const BRIDGE_PORT = Number(process.env.E2E_BRIDGE_PORT) || 3001;
const runtime = mkdtempSync(join(tmpdir(), 'brokr-e2e-'));

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    headless: true,
  },
  webServer: [
    {
      command: `node bridge/server.cjs`,
      // Wait on the real health URL (IPv4) so the bridge is actually serving
      // HTTP before tests run — a raw TCP port check can pass too early.
      url: `http://127.0.0.1:${BRIDGE_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        BRIDGE_DB_PATH: ':memory:',
        BRIDGE_HOST: '127.0.0.1',
        BRIDGE_PORT: String(BRIDGE_PORT),
        BRIDGE_MODE: 'desktop',
        BRIDGE_API_KEY: '',
        BRIDGE_ENCRYPTION_KEY: '',
        BRIDGE_CONFIG_PATH: join(runtime, 'config.json'),
        BRIDGE_HISTORY_PATH: join(runtime, 'history.json'),
        BRIDGE_LOG_DIR: join(runtime, 'logs'),
        BRIDGE_CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { VITE_EDITION: 'desktop', VITE_BRIDGE_URL: `http://127.0.0.1:${BRIDGE_PORT}`, VITE_BRIDGE_API_KEY: '' },
    },
  ],
});
