#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const allowedStorageLocalGet = new Set([
  'background/crypto-storage.js',
  'background/solana-rpc-helpers.js',
]);
const allowedStorageLocalSet = new Set([
  'background/crypto-storage.js',
]);

let failed = false;

function fail(msg) {
  console.error('check-duplicate-helpers:', msg);
  failed = true;
}

function rgFiles(pattern, searchPath, extraArgs) {
  const cmd =
    "rg -l " +
    (extraArgs ? extraArgs + ' ' : '') +
    "'" +
    pattern +
    "' " +
    searchPath;
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

const getFiles = rgFiles(
  'function storageLocalGet',
  'background',
  "--glob '*.js' --glob '!*.bundle.js'"
);
for (const rel of getFiles) {
  if (!allowedStorageLocalGet.has(rel)) {
    fail('function storageLocalGet defined outside allowed files: ' + rel);
  }
}

const setFiles = rgFiles(
  'function storageLocalSet',
  'background',
  "--glob '*.js' --glob '!*.bundle.js'"
);
for (const rel of setFiles) {
  if (!allowedStorageLocalSet.has(rel)) {
    fail('function storageLocalSet defined outside allowed files: ' + rel);
  }
}

const wfHits = rgFiles(
  'function normalizeImportedWorkflows',
  'extension settings sidepanel',
  "--glob '*.js'"
);
const allowedWf = new Set(['extension/workflow-normalize.js']);
for (const rel of wfHits) {
  if (!allowedWf.has(rel)) {
    fail('function normalizeImportedWorkflows defined outside extension/workflow-normalize.js: ' + rel);
  }
}

if (failed) process.exit(1);
console.log('check-duplicate-helpers: ok');
