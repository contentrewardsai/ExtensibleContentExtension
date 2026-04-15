#!/usr/bin/env node
/**
 * Build inline template registry for file:// fallback.
 * Reads generator/templates/manifest.json + each template.json,
 * outputs generator/templates-inline.js with all data embedded.
 *
 * Usage: node scripts/build-inline-templates.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'generator', 'templates', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const registry = {};

for (const id of manifest.templates) {
  const tplPath = path.join(root, 'generator', 'templates', id, 'template.json');
  if (!fs.existsSync(tplPath)) {
    console.warn('⚠ Template not found, skipping:', id);
    continue;
  }
  registry[id] = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
}

const output = [
  '/**',
  ' * Inline template registry — fallback for file:// protocol where fetch() is blocked by CORS.',
  ' * Auto-generated from generator/templates/manifest.json + template.json files.',
  ' * Re-generate: node scripts/build-inline-templates.cjs',
  ' */',
  '(function () {',
  '  "use strict";',
  '  window.__CFS_inlineTemplates = ' + JSON.stringify(registry) + ';',
  '  window.__CFS_inlineTemplateIds = ' + JSON.stringify(manifest.templates) + ';',
  '})();',
  '',
].join('\n');

const outPath = path.join(root, 'generator', 'templates-inline.js');
fs.writeFileSync(outPath, output);

console.log('✓ Generated', path.relative(root, outPath), '(' + Object.keys(registry).length + ' templates, ' + Math.round(output.length / 1024) + ' KB)');
