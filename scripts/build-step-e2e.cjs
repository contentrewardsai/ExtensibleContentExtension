#!/usr/bin/env node
/**
 * Builds test/e2e-step-config.json from steps/{id}/e2e.json.
 * Each step can have e2e.json: workflowId, rows, assert (fixture/sidepanel/echo).
 * The E2E runner merges this with its default playback workflows.
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const stepsDir = path.join(projectRoot, 'steps');
const outPath = path.join(projectRoot, 'test/e2e-step-config.json');

const manifestPath = path.join(projectRoot, 'steps/manifest.json');
let stepIds = [];
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  stepIds = Array.isArray(manifest.steps) ? manifest.steps : [];
} catch (_) {}

const TINY_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_AUDIO_URL = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==';

const workflows = [];
for (const id of stepIds) {
  const testConfigPath = path.join(stepsDir, id, 'test-config.json');
  const e2ePath = path.join(stepsDir, id, 'e2e.json');
  let data = null;
  let source = '';
  if (fs.existsSync(testConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
      data = cfg.e2e;
      source = 'test-config.json';
    } catch (e) {
      console.warn('Invalid steps/' + id + '/test-config.json:', e.message);
    }
  }
  if (!data && fs.existsSync(e2ePath)) {
    try {
      data = JSON.parse(fs.readFileSync(e2ePath, 'utf8'));
      source = 'e2e.json';
    } catch (e) {
      console.warn('Invalid steps/' + id + '/e2e.json:', e.message);
    }
  }
  if (!data || !data.workflowId) continue;
  const rows = Array.isArray(data.rows) ? data.rows : [{}];
  const subst = (r) => {
    const out = { ...r };
    for (const k of Object.keys(out)) {
      if (out[k] === '__TINY_DATA_URL__') out[k] = TINY_DATA_URL;
      if (out[k] === '__TINY_AUDIO_URL__') out[k] = TINY_AUDIO_URL;
    }
    return out;
  };
  workflows.push({
    id: data.workflowId,
    rows: rows.map(subst),
    assert: data.assert || 'fixture',
    prereqs: Array.isArray(data.prereqs) ? data.prereqs : [],
    skipInCI: !!data.skipInCI,
    skipReason: data.skipReason || '',
  });
}

fs.writeFileSync(outPath, JSON.stringify({ workflows }, null, 2));
console.log('Updated test/e2e-step-config.json with', workflows.length, 'step E2E(s)');
