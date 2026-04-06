#!/usr/bin/env node
/**
 * Scaffolds a step-tests.js file for a step that doesn't have one yet.
 * Reads the step's step.json to determine fields, then generates:
 *   1. resolveTemplate helper
 *   2. buildPayload function based on step.json action fields
 *   3. Core payload-shape test
 *   4. Row template resolution test
 *   5. Validation assertions (missing required fields, defaults)
 *
 * Usage:
 *   node scripts/scaffold-step-tests.cjs <stepId>
 *   node scripts/scaffold-step-tests.cjs solanaTransferSol
 *   node scripts/scaffold-step-tests.cjs --list          # list steps without step-tests.js
 *   node scripts/scaffold-step-tests.cjs --dry-run <id>  # print to stdout, don't write
 *
 * After scaffolding, run `npm run build:step-tests` to inject the script tag.
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const stepsDir = path.join(projectRoot, 'steps');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const listOnly = args.includes('--list');
const stepId = args.filter((a) => !a.startsWith('--'))[0];

const manifestPath = path.join(stepsDir, 'manifest.json');
let allSteps = [];
try {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  allSteps = Array.isArray(m.steps) ? m.steps : [];
} catch (_) {}

if (listOnly) {
  const missing = allSteps.filter(
    (id) => !fs.existsSync(path.join(stepsDir, id, 'step-tests.js'))
  );
  if (missing.length === 0) {
    console.log('All steps have step-tests.js files.');
  } else {
    console.log(`${missing.length} step(s) without step-tests.js:\n`);
    missing.forEach((id) => console.log('  ' + id));
  }
  process.exit(0);
}

if (!stepId) {
  console.error('Usage: node scripts/scaffold-step-tests.cjs <stepId>');
  console.error('       node scripts/scaffold-step-tests.cjs --list');
  process.exit(1);
}

const stepDir = path.join(stepsDir, stepId);
const stepJsonPath = path.join(stepDir, 'step.json');
const outPath = path.join(stepDir, 'step-tests.js');

if (!fs.existsSync(stepDir)) {
  console.error(`Step directory not found: steps/${stepId}/`);
  process.exit(1);
}

if (fs.existsSync(outPath) && !dryRun) {
  console.error(`steps/${stepId}/step-tests.js already exists. Use --dry-run to preview.`);
  process.exit(1);
}

/* Read step.json for field hints */
let stepMeta = {};
try {
  stepMeta = JSON.parse(fs.readFileSync(stepJsonPath, 'utf8'));
} catch (_) {
  console.warn(`Warning: could not read steps/${stepId}/step.json; generating minimal scaffold.`);
}

const label = stepMeta.label || stepId;

/* Determine fields from step.json — supports multiple formats */
let rawFields = [];
if (Array.isArray(stepMeta.fields) && stepMeta.fields.length > 0) {
  rawFields = stepMeta.fields;
} else if (Array.isArray(stepMeta.formSchema) && stepMeta.formSchema.length > 0) {
  /* formSchema entries have { key, label, inputType, ... } */
  const skip = new Set(['runIf', 'label']);
  rawFields = stepMeta.formSchema
    .filter((f) => f && (f.key || f.id) && !skip.has(f.key || f.id))
    .map((f) => {
      const fid = f.key || f.id;
      const isCheckbox = f.inputType === 'checkbox' || f.type === 'checkbox';
      const defaultVal = stepMeta.defaultAction ? stepMeta.defaultAction[fid] : undefined;
      return {
        id: fid,
        type: isCheckbox ? 'checkbox' : 'text',
        optional: isCheckbox || fid.startsWith('save') || fid === 'rpcUrl' ||
          (typeof defaultVal === 'boolean'),
      };
    });
} else if (stepMeta.defaultAction && typeof stepMeta.defaultAction === 'object') {
  /* Synthesize fields from defaultAction keys */
  const skip = new Set(['type', 'runIf', 'label']);
  rawFields = Object.keys(stepMeta.defaultAction)
    .filter((k) => !skip.has(k))
    .map((k) => {
      const v = stepMeta.defaultAction[k];
      return {
        id: k,
        type: typeof v === 'boolean' ? 'checkbox' : 'text',
        optional: typeof v === 'boolean' || k.startsWith('save') || k === 'rpcUrl',
      };
    });
}

/* Determine which fields are required (heuristic: first 5 non-optional fields) */
const requiredFields = rawFields.filter((f) => f && f.id && !f.optional && f.type !== 'checkbox').slice(0, 5);
const optionalFields = rawFields.filter((f) => f && f.id && (f.optional || f.type === 'checkbox')).slice(0, 3);
const allFieldIds = [...requiredFields, ...optionalFields].map((f) => f.id);

/* Detect the message type from handler.js if possible */
let messageType = 'CFS_STEP_MESSAGE';
try {
  const handler = fs.readFileSync(path.join(stepDir, 'handler.js'), 'utf8');
  const typeMatch = handler.match(/type:\s*['"]([A-Z_]+)['"]/);
  if (typeMatch) messageType = typeMatch[1];
} catch (_) {}

/* Build the test file */
function indent(n) { return '  '.repeat(n); }

function generateFieldLine(f, depth) {
  const id = f.id;
  if (f.type === 'checkbox') return `${indent(depth)}${id}: action.${id} === true,`;
  return `${indent(depth)}var ${id} = resolveTemplate(String(action.${id} != null ? action.${id} : '').trim(), row, getRowValue).trim();`;
}

const output = `/**
 * Unit tests for ${stepId} — payload shape mirrors handler.js.
 * Generated by scripts/scaffold-step-tests.cjs
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\\{\\{([^}]+)\\}\\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function buildPayload(action, row, getRowValue) {
${requiredFields.map((f) => `    var ${f.id} = resolveTemplate(String(action.${f.id} != null ? action.${f.id} : '').trim(), row, getRowValue).trim();`).join('\n')}
    return {
      type: '${messageType}',
${requiredFields.map((f) => `      ${f.id}: ${f.id},`).join('\n')}
${optionalFields.filter((f) => f.type === 'checkbox').map((f) => `      ${f.id}: action.${f.id} === true,`).join('\n')}
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('${stepId}', [
    /* --- Core payload shape --- */
    { name: 'buildPayload core fields', fn: function () {
      var p = buildPayload({
${requiredFields.map((f) => `        ${f.id}: 'test_${f.id}',`).join('\n')}
      }, {}, getRowValue);
      runner.assertEqual(p.type, '${messageType}');
${requiredFields.map((f) => `      runner.assertEqual(p.${f.id}, 'test_${f.id}');`).join('\n')}
    }},

    /* --- Row template resolution --- */
    { name: 'buildPayload row templates', fn: function () {
      var row = { ${requiredFields.slice(0, 2).map((f, i) => `${f.id}Val: 'resolved_${i}'`).join(', ')} };
      var p = buildPayload({
${requiredFields.slice(0, 2).map((f) => `        ${f.id}: '{{${f.id}Val}}',`).join('\n')}
      }, row, getRowValue);
${requiredFields.slice(0, 2).map((f, i) => `      runner.assertEqual(p.${f.id}, 'resolved_${i}');`).join('\n')}
    }},

    /* --- Validation: missing required fields --- */
${requiredFields.map((f) => `    { name: 'buildPayload missing ${f.id} yields empty', fn: function () {
      var p = buildPayload({${requiredFields.filter((r) => r.id !== f.id).map((r) => ` ${r.id}: 'x'`).join(',')} }, {}, getRowValue);
      runner.assertEqual(p.${f.id}, '');
    }},`).join('\n')}

    /* --- Validation: missing template var yields empty --- */
    { name: 'buildPayload missing template var', fn: function () {
      var p = buildPayload({
${requiredFields.slice(0, 1).map((f) => `        ${f.id}: '{{nonExistentKey}}',`).join('\n')}
      }, {}, getRowValue);
${requiredFields.slice(0, 1).map((f) => `      runner.assertEqual(p.${f.id}, '');`).join('\n')}
    }},
${optionalFields.filter((f) => f.type === 'checkbox').length > 0 ? `
    /* --- Validation: boolean defaults --- */
    { name: 'buildPayload boolean defaults to false', fn: function () {
      var p = buildPayload({${requiredFields.map((r) => ` ${r.id}: 'x'`).join(',')} }, {}, getRowValue);
${optionalFields.filter((f) => f.type === 'checkbox').map((f) => `      runner.assertEqual(p.${f.id}, false);`).join('\n')}
    }},` : ''}
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
`;

if (dryRun) {
  console.log(output);
  console.log(`\n--- Dry run: would write to steps/${stepId}/step-tests.js ---`);
} else {
  fs.writeFileSync(outPath, output);
  console.log(`Created steps/${stepId}/step-tests.js (${requiredFields.length} required fields, ${optionalFields.length} optional)`);
  console.log('Run `npm run build:step-tests` to inject the script tag into test HTML files.');
}
