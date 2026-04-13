import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'node bridge/server.cjs',
      port: 3001,
      reuseExistingServer: true,
      env: {
        BRIDGE_DB_PATH: ':memory:',
        BRIDGE_HOST: '127.0.0.1',
      },
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
