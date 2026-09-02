#!/usr/bin/env node
/**
 * Bridge test entrypoint.
 *
 * Almost every suite here spawns a real server.cjs, and server.cjs falls back to
 * `bridge/config.json` when BRIDGE_CONFIG_PATH is unset. The children inherit
 * the parent environment, so running the suite used to write test connections
 * into the developer's own config — that is where a stray `c-secret` entry with
 * a cleartext password came from on 2026-09-02.
 *
 * Pointing the whole run at a throwaway directory fixes every suite at once,
 * and keeps working for suites added later that forget to isolate themselves.
 */
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const dir = mkdtempSync(path.join(tmpdir(), 'brokr-tests-'));

const result = spawnSync(
  process.execPath,
  ['--test', ...process.argv.slice(2).length ? process.argv.slice(2) : ['bridge/__tests__/*.test.cjs']],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      BRIDGE_CONFIG_PATH: path.join(dir, 'config.json'),
      BRIDGE_HISTORY_PATH: path.join(dir, 'kpi-history.json'),
      // Neutralise secrets a developer may have in bridge/.env. dotenv does not
      // override variables that are already present, so an empty value here
      // wins; a suite that needs one sets it explicitly in its own spawn env.
      BRIDGE_ENCRYPTION_KEY: '',
      BRIDGE_API_KEY: '',
    },
  },
);

rmSync(dir, { recursive: true, force: true });
process.exit(result.status ?? 1);
