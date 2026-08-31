#!/usr/bin/env node
/**
 * FF-1: the client-edition bundle must physically exclude fleet surfaces, and
 * full builds must contain them (guards against over-gating).
 *
 * Usage: node scripts/check-edition-bundle.mjs <desktop|client|internal> [distDir]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SENTINELS = ['FLEET AVG', '/compare'];

const edition = process.argv[2];
const distDir = process.argv[3] || 'dist';
if (!['desktop', 'client', 'internal'].includes(edition)) {
  console.error('usage: check-edition-bundle.mjs <desktop|client|internal> [distDir]');
  process.exit(2);
}

const assetsDir = join(distDir, 'assets');
const files = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
const hits = new Map(SENTINELS.map((s) => [s, []]));
for (const file of files) {
  const text = readFileSync(join(assetsDir, file), 'utf8');
  for (const sentinel of SENTINELS) {
    if (text.includes(sentinel)) hits.get(sentinel).push(file);
  }
}

let failed = false;
for (const [sentinel, where] of hits) {
  if (edition === 'client' && where.length > 0) {
    console.error(`FAIL: client bundle contains fleet sentinel "${sentinel}" in ${where.join(', ')}`);
    failed = true;
  }
  if (edition !== 'client' && where.length === 0) {
    console.error(`FAIL: ${edition} bundle is missing expected sentinel "${sentinel}" — over-gated?`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`OK: ${edition} bundle sentinel check passed (${files.length} chunks scanned)`);
