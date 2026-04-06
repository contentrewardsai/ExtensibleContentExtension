#!/usr/bin/env node
/**
 * Coverage-diff check: compare current V8 coverage against a baseline.
 * Fails (exit 1) if overall coverage decreases by more than THRESHOLD.
 *
 * Usage:
 *   1. Generate baseline: npm run test:coverage  (creates coverage-report.json)
 *   2. Save baseline:     cp coverage-report.json coverage-baseline.json
 *   3. After changes:     npm run test:coverage && node scripts/coverage-diff.cjs
 *
 * Environment variables:
 *   COVERAGE_THRESHOLD  — max allowed percentage drop (default: 0.5)
 *   COVERAGE_BASELINE   — path to baseline file (default: coverage-baseline.json)
 *   COVERAGE_CURRENT    — path to current file (default: coverage-report.json)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const THRESHOLD = parseFloat(process.env.COVERAGE_THRESHOLD || '0.5');
const baselinePath = path.resolve(root, process.env.COVERAGE_BASELINE || 'coverage-baseline.json');
const currentPath = path.resolve(root, process.env.COVERAGE_CURRENT || 'coverage-report.json');

if (!fs.existsSync(baselinePath)) {
  console.log('⚠  No baseline found at ' + baselinePath);
  console.log('   Run: npm run test:coverage && cp coverage-report.json coverage-baseline.json');
  console.log('   Skipping coverage-diff check.');
  process.exit(0);
}

if (!fs.existsSync(currentPath)) {
  console.error('✗  No current coverage report at ' + currentPath);
  console.error('   Run: npm run test:coverage');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

const baseOverall = baseline.overall || 0;
const curOverall = current.overall || 0;
const delta = curOverall - baseOverall;

console.log('── Coverage Diff ──────────────────────────────────────');
console.log('Baseline: ' + baseOverall.toFixed(1) + '%');
console.log('Current:  ' + curOverall.toFixed(1) + '%');
console.log('Delta:    ' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%');
console.log('Threshold: -' + THRESHOLD + '% max decrease allowed');
console.log('');

// Per-file comparison
const baseFiles = new Map((baseline.files || []).map(f => [f.file, f]));
const curFiles = new Map((current.files || []).map(f => [f.file, f]));

const regressions = [];
const improvements = [];

for (const [file, cur] of curFiles) {
  const base = baseFiles.get(file);
  if (!base) continue; // new file, skip
  const fileDelta = cur.coveragePct - base.coveragePct;
  if (fileDelta < -1.0) regressions.push({ file, from: base.coveragePct, to: cur.coveragePct, delta: fileDelta });
  if (fileDelta > 1.0) improvements.push({ file, from: base.coveragePct, to: cur.coveragePct, delta: fileDelta });
}

if (improvements.length > 0) {
  console.log('Improved files:');
  for (const r of improvements.sort((a, b) => b.delta - a.delta).slice(0, 10)) {
    console.log('  ✓ ' + r.file + ': ' + r.from.toFixed(1) + '% → ' + r.to.toFixed(1) + '% (+' + r.delta.toFixed(1) + '%)');
  }
  console.log('');
}

if (regressions.length > 0) {
  console.log('Regressed files:');
  for (const r of regressions.sort((a, b) => a.delta - b.delta)) {
    console.log('  ✗ ' + r.file + ': ' + r.from.toFixed(1) + '% → ' + r.to.toFixed(1) + '% (' + r.delta.toFixed(1) + '%)');
  }
  console.log('');
}

if (delta < -THRESHOLD) {
  console.error('✗  Coverage decreased by ' + Math.abs(delta).toFixed(1) + '%, exceeding threshold of ' + THRESHOLD + '%.');
  console.error('   Add tests to restore coverage before merging.');
  process.exit(1);
} else {
  console.log('✓  Coverage check passed.');
  process.exit(0);
}
