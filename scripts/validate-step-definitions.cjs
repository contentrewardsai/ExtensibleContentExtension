#!/usr/bin/env node
/**
 * Validate all steps/{id}/step.json files against the step definition contract.
 * Run: node scripts/validate-step-definitions.cjs
 * Exit code: 0 if all valid, 1 if any invalid.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STEPS_DIR = path.join(ROOT, 'steps');
const MANIFEST_PATH = path.join(STEPS_DIR, 'manifest.json');

function validateStepDefinition(data, stepId) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['step.json must be an object'] };
  }
  if (!data.id || typeof data.id !== 'string') {
    errors.push('Missing or invalid id');
  } else if (stepId && data.id !== stepId) {
    errors.push('id "' + data.id + '" does not match folder "' + stepId + '"');
  }
  if (!data.label || typeof data.label !== 'string') {
    errors.push('Missing or invalid label');
  }
  if (!data.defaultAction || typeof data.defaultAction !== 'object') {
    errors.push('Missing or invalid defaultAction');
  } else {
    if (!data.defaultAction.type || typeof data.defaultAction.type !== 'string') {
      errors.push('defaultAction must include type');
    }
    if (data.id && data.defaultAction.type !== data.id) {
      errors.push('defaultAction.type must match id');
    }
  }
  if (data.formSchema != null && !Array.isArray(data.formSchema)) {
    errors.push('formSchema must be an array');
  }
  return { valid: errors.length === 0, errors };
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to read steps/manifest.json:', e.message);
    process.exit(1);
  }

  const stepIds = Array.isArray(manifest.steps) ? manifest.steps : [];
  if (stepIds.length === 0) {
    console.log('No steps in manifest');
    process.exit(0);
  }

  let hasErrors = false;
  for (const id of stepIds) {
    const stepPath = path.join(STEPS_DIR, id, 'step.json');
    if (!fs.existsSync(stepPath)) {
      console.error('steps/' + id + '/step.json: file not found');
      hasErrors = true;
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(stepPath, 'utf8'));
    } catch (e) {
      console.error('steps/' + id + '/step.json: invalid JSON -', e.message);
      hasErrors = true;
      continue;
    }
    const result = validateStepDefinition(data, id);
    if (!result.valid) {
      console.error('steps/' + id + '/step.json:', result.errors.join('; '));
      hasErrors = true;
    }
  }

  if (hasErrors) process.exit(1);
  console.log('All', stepIds.length, 'step definitions valid.');
}

main();
