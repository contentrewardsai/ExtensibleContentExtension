#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const bundlePath = path.join(root, 'shared/content-script-tab-bundle.js');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fromManifest = manifest.content_scripts[0].js;

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), ctx);
const fromBundle = ctx.CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES;

if (!Array.isArray(fromBundle)) {
  console.error('check-content-bundle: CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES is not an array');
  process.exit(1);
}

function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

if (!same(fromManifest, fromBundle)) {
  console.error('check-content-bundle: manifest.json content_scripts[0].js does not match shared/content-script-tab-bundle.js');
  console.error('  manifest:', JSON.stringify(fromManifest, null, 2));
  console.error('  bundle:  ', JSON.stringify(fromBundle, null, 2));
  process.exit(1);
}

console.log('check-content-bundle: OK (', fromBundle.length, 'files)');
process.exit(0);
