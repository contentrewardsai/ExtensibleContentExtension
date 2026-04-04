#!/usr/bin/env node
/**
 * Summarize where tests live (not Istanbul line coverage).
 * Run: node scripts/report-test-landscape.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function walkJsFiles(dir, { skipDirNames = new Set() } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (skipDirNames.has(ent.name)) continue;
        stack.push(full);
      } else if (ent.isFile() && ent.name.endsWith('.js') && !ent.name.includes('.bundle.')) {
        out.push(full);
      }
    }
  }
  return out;
}

// --- Manifest steps vs step-tests.js ---
const manifestPath = path.join(root, 'steps', 'manifest.json');
const stepsDir = path.join(root, 'steps');
const manifest = JSON.parse(read(manifestPath));
const stepIds = Array.isArray(manifest.steps) ? manifest.steps : [];
const withStepTests = stepIds.filter((id) => fs.existsSync(path.join(stepsDir, id, 'step-tests.js')));
const missingStepTests = stepIds.filter((id) => !fs.existsSync(path.join(stepsDir, id, 'step-tests.js')));

// --- test/unit-tests.js: functions named test* ---
const unitTestsPath = path.join(root, 'test', 'unit-tests.js');
let unitTestFnCount = 0;
if (fs.existsSync(unitTestsPath)) {
  const u = read(unitTestsPath);
  const re = /\bfunction\s+(test\w+)\s*\(/g;
  let m;
  while ((m = re.exec(u)) !== null) unitTestFnCount++;
}

// --- step-tests.js: rough count of test cases ({ name: ... fn: }) ---
let stepTestCaseCount = 0;
for (const id of withStepTests) {
  const p = path.join(stepsDir, id, 'step-tests.js');
  const s = read(p);
  const re = /\{\s*name:\s*['"][^'"]*['"]\s*,\s*fn:/g;
  let m;
  while ((m = re.exec(s)) !== null) stepTestCaseCount++;
}

// --- JS inventory (no % coverage) ---
const sharedJs = walkJsFiles(path.join(root, 'shared'));
const contentJs = walkJsFiles(path.join(root, 'content'));
const bgJs = walkJsFiles(path.join(root, 'background'), { skipDirNames: new Set() });

console.log('Test landscape (counts only; not line/branch coverage)\n');
console.log(`Manifest steps: ${stepIds.length}`);
console.log(`  With steps/<id>/step-tests.js: ${withStepTests.length}`);
if (missingStepTests.length) {
  console.log(`  Missing step-tests.js (${missingStepTests.length}):`);
  for (const id of missingStepTests) console.log(`    ${id}`);
}
console.log(`Registered step test cases (heuristic, { name, fn } in step-tests.js): ~${stepTestCaseCount}`);
console.log(`Top-level test* functions in test/unit-tests.js: ${unitTestFnCount}`);
console.log('');
console.log('Untested-by-unit surface (informative):');
console.log(`  shared/*.js files: ${sharedJs.length}`);
console.log(`  content/*.js files: ${contentJs.length}`);
console.log(`  background/*.js files: ${bgJs.length} (service worker; covered by focused scripts + e2e, not V8 coverage here)`);
console.log('');
console.log('Commands: npm run test:unit | npm run report:step-test-coverage | npm run report:test-landscape');
