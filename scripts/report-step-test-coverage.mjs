#!/usr/bin/env node
/**
 * Report steps in manifest.json that lack step-tests.js.
 * Exit 0 always (informational). Run: node scripts/report-step-test-coverage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'steps', 'manifest.json');
const stepsDir = path.join(root, 'steps');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const stepIds = Array.isArray(manifest.steps) ? manifest.steps : [];
const missing = stepIds.filter((id) => !fs.existsSync(path.join(stepsDir, id, 'step-tests.js')));
const withTests = stepIds.length - missing.length;

console.log(`Step test coverage: ${withTests}/${stepIds.length} manifest steps have step-tests.js`);
if (missing.length) {
  console.log(`Missing (${missing.length}):`);
  for (const id of missing) console.log(`  ${id}`);
}
