import { defineConfig } from '@playwright/test';

// B-6 on the local rig: a client-mode instance behind real Keycloak OIDC.
// Nothing is started here — bring the rig up first (scripts/local-rig/start-rig.ps1)
// and build the client edition into its app dir. Run:
//   npx playwright test --config playwright.rig.config.ts
// RIG_URL / RIG_IDP_USERS override the defaults (tenant0, realm users owner/member).
export default defineConfig({
  testDir: './e2e/rig',
  timeout: 90000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.RIG_URL || 'http://localhost:3101',
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },
});
