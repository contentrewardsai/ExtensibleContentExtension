#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const allowedStorageLocalGet = new Set([
  'background/crypto-storage.js',
  'background/solana-rpc-helpers.js',
]);

let failed = false;

function fail(msg) {
  console.error('check-duplicate-helpers:', msg);
  failed = true;
}

let out = '';
try {
  out = execSync(
    "rg -l 'function storageLocalGet' background --glob '*.js' --glob '!*.bundle.js'",
    { cwd: root, encoding: 'utf8' }
  );
} catch (e) {
  if (e.status !== 1) throw e;
}

const files = out.trim().split('\n').filter(Boolean);
for (const rel of files) {
  if (!allowedStorageLocalGet.has(rel)) {
    fail('function storageLocalGet defined outside allowed files: ' + rel);
  }
}

const wfHits = execSync(
  "rg -l 'function normalizeImportedWorkflows' extension settings sidepanel --glob '*.js'",
  { cwd: root, encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

const allowedWf = new Set(['extension/workflow-normalize.js']);
for (const rel of wfHits) {
  if (!allowedWf.has(rel)) {
    fail('function normalizeImportedWorkflows defined outside extension/workflow-normalize.js: ' + rel);
  }
}

if (failed) process.exit(1);
console.log('check-duplicate-helpers: ok');
