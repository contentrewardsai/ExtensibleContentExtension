#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
let failed = false;

function fail(msg) {
  console.error('check-dead-assets:', msg);
  failed = true;
}

const forbiddenPaths = [
  'lib/pixi.min.js',
  'lib/pixi-unsafe-eval.min.js',
  'lib/fabric-textbaseline-patch.js',
  'lib/Sortable.min.js',
  'lib/fabric.min.js',
  'lib/html2canvas.min.js',
  'lib/socket.io.min.js',
  'shared/tutorial-loader.js',
  'shared/download-mcp-server.js',
  'shared/book-builder.js',
  'shared/tooltip-overlay.js',
  'icons/icon-source.svg',
  'icons/pixel.png',
  'test/serve.py',
  'test/fixtures/sample-page.html',
  'scripts/update-remaining-doc.cjs',
  'scripts/generate-step-test-includes.cjs',
];

for (const rel of forbiddenPaths) {
  if (fs.existsSync(path.join(root, rel))) {
    fail('forbidden file still exists: ' + rel);
  }
}

if (fs.existsSync(path.join(root, 'uploads/testing'))) {
  fail('uploads/testing/ should be removed');
}

try {
  const hits = execSync(
    "rg -l 'tutorial-loader\\.js|download-mcp-server\\.js|lib/pixi\\.min\\.js|book-builder\\.js|lib/socket\\.io\\.min\\.js|lib/Sortable\\.min\\.js|lib/fabric\\.min\\.js|lib/html2canvas\\.min\\.js' --glob '!node_modules/**' --glob '!shared/content-script-tab-bundle.js' --glob '!scripts/check-dead-assets.cjs' .",
    { cwd: root, encoding: 'utf8' }
  ).trim();
  if (hits) {
    fail('references to removed assets found in:\n' + hits);
  }
} catch (e) {
  if (e.status !== 1) throw e;
}

if (failed) process.exit(1);
console.log('check-dead-assets: ok');
