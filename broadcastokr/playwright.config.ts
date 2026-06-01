import { defineConfig } from '@playwright/test';

// Ports are overridable so the suite can avoid collisions with other local
// dev servers. CI uses the defaults on a clean runner.
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 5173;
const BRIDGE_PORT = Number(process.env.E2E_BRIDGE_PORT) || 3001;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
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
      },
    },
    {
      command: `npx vite --port ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: false,
    },
  ],
});
