#!/usr/bin/env node
/**
 * Builds test/unit-tests.html and settings/settings.html by injecting script tags
 * for all steps that have handler.js and/or step-tests.js.
 * Reads steps/manifest.json, writes <!-- STEP_HANDLERS --> and <!-- STEP_TESTS --> sections.
 * Run: node scripts/build-step-tests.cjs
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'steps/manifest.json');
const stepsDir = path.join(projectRoot, 'steps');

const TESTS_START = '<!-- STEP_TESTS_START -->';
const TESTS_END = '<!-- STEP_TESTS_END -->';
const HANDLERS_START = '<!-- STEP_HANDLERS_START -->';
const HANDLERS_END = '<!-- STEP_HANDLERS_END -->';

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error('Could not read steps/manifest.json:', e.message);
  process.exit(1);
}

const stepIds = Array.isArray(manifest.steps) ? manifest.steps : [];

function buildSection(startMarker, endMarker, tags) {
  return tags.length > 0
    ? `${startMarker}\n${tags.join('\n')}\n  ${endMarker}`
    : `${startMarker}\n  ${endMarker}`;
}

function replaceSection(html, startMarker, endMarker, section) {
  if (html.includes(startMarker) && html.includes(endMarker)) {
    const re = new RegExp(
      startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[\\s\\S]*?' +
      endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return html.replace(re, section);
  }
  return html;
}

const testTags = stepIds
  .filter((id) => fs.existsSync(path.join(stepsDir, id, 'step-tests.js')))
  .map((id) => `  <script src="../steps/${id}/step-tests.js"></script>`);

const handlerTags = stepIds
  .filter((id) => fs.existsSync(path.join(stepsDir, id, 'handler.js')))
  .map((id) => `  <script src="../steps/${id}/handler.js"></script>`);

const testsSection = buildSection(TESTS_START, TESTS_END, testTags);
const handlersSection = buildSection(HANDLERS_START, HANDLERS_END, handlerTags);

const htmlFiles = [
  path.join(projectRoot, 'test/unit-tests.html'),
  path.join(projectRoot, 'settings/settings.html'),
];

for (const htmlPath of htmlFiles) {
  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (e) {
    console.warn('Could not read ' + path.relative(projectRoot, htmlPath) + ':', e.message);
    continue;
  }

  let newHtml = html;
  if (newHtml.includes(HANDLERS_START)) {
    newHtml = replaceSection(newHtml, HANDLERS_START, HANDLERS_END, handlersSection);
  }
  if (newHtml.includes(TESTS_START)) {
    newHtml = replaceSection(newHtml, TESTS_START, TESTS_END, testsSection);
  } else {
    newHtml = newHtml.replace(
      /(<script src="unit-tests\.js"><\/script>)/,
      `$1\n${testsSection}\n`
    );
  }

  if (newHtml !== html) {
    fs.writeFileSync(htmlPath, newHtml);
    console.log('Updated', path.relative(projectRoot, htmlPath), 'with', handlerTags.length, 'handler(s) and', testTags.length, 'test(s)');
  }
}
