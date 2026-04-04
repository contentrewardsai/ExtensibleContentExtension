#!/usr/bin/env node
/**
 * Guard: bscQuery v3NpmPosition is implemented and validated (no chain).
 * Run: node scripts/verify-bsc-v3-npm-query-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const evmPath = path.join(root, 'background', 'bsc-evm.js');
const stepPath = path.join(root, 'steps', 'bscQuery', 'step.json');
const progPath = path.join(root, 'docs', 'PROGRAMMATIC_API.md');

for (const p of [swPath, evmPath, stepPath, progPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-bsc-v3-npm-query-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const evm = fs.readFileSync(evmPath, 'utf8');
const step = fs.readFileSync(stepPath, 'utf8');
const prog = fs.readFileSync(progPath, 'utf8');

const checks = [
  [sw, "qop === 'v3NpmPosition'", 'service-worker.js: CFS_BSC_QUERY v3NpmPosition branch'],
  [sw, 'v3PositionTokenId required', 'service-worker.js: v3NpmPosition validation message'],
  [evm, "op === 'v3NpmPosition'", 'bsc-evm.js: v3NpmPosition query handler'],
  [evm, 'cNpmRead.positions', 'bsc-evm.js: positions() read'],
  [evm, 'cNpmRead.ownerOf', 'bsc-evm.js: ownerOf read'],
  [step, '"value": "v3NpmPosition"', 'step.json: v3NpmPosition option'],
  [prog, '## CFS_BSC_QUERY', 'PROGRAMMATIC_API.md: CFS_BSC_QUERY section'],
  [prog, "operation: 'v3NpmPosition'", 'PROGRAMMATIC_API.md: v3NpmPosition example'],
];

for (const [text, needle, label] of checks) {
  if (!text.includes(needle)) {
    console.error('verify-bsc-v3-npm-query-wired: missing:', label);
    process.exit(1);
  }
}

console.log('verify-bsc-v3-npm-query-wired: OK');
process.exit(0);
