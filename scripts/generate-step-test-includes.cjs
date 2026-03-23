#!/usr/bin/env node
/**
 * Generates step test script tags for test/unit-tests.html from steps/manifest.json.
 * For each step that has steps/{id}/step-tests.js, outputs a script tag.
 * Run before tests or as part of Reload Extension. Usage:
 *   node scripts/generate-step-test-includes.cjs
 * Outputs script tags to stdout; pipe to update unit-tests.html or use as reference.
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'steps/manifest.json');
const stepsDir = path.join(projectRoot, 'steps');

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error('Could not read steps/manifest.json:', e.message);
  process.exit(1);
}

const stepIds = Array.isArray(manifest.steps) ? manifest.steps : [];
const tags = stepIds
  .filter((id) => fs.existsSync(path.join(stepsDir, id, 'step-tests.js')))
  .map((id) => `  <script src="../steps/${id}/step-tests.js"></script>`);

if (tags.length > 0) {
  console.log(tags.join('\n'));
}
