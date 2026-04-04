#!/usr/bin/env node
/**
 * Guard: Pulse/crypto gate allowlist (shared/crypto-workflow-step-ids.js) matches steps/manifest.json.
 * - Every listed type must exist in manifest.steps
 * - Every manifest step that looks chain/Pulse-related must be listed (so new steps are not gated off by mistake)
 * Run: node scripts/verify-crypto-workflow-step-types.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cwPath = path.join(root, 'shared', 'crypto-workflow-step-ids.js');
const manPath = path.join(root, 'steps', 'manifest.json');

for (const p of [cwPath, manPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-crypto-workflow-step-types: missing', path.relative(root, p));
    process.exit(1);
  }
}

const cw = fs.readFileSync(cwPath, 'utf8');
const start = cw.indexOf('CRYPTO_OR_PULSE_STEP_TYPES = [');
if (start < 0) {
  console.error('verify-crypto-workflow-step-types: could not find CRYPTO_OR_PULSE_STEP_TYPES array');
  process.exit(1);
}
const end = cw.indexOf('\n  ];', start);
if (end < 0) {
  console.error('verify-crypto-workflow-step-types: could not find end of CRYPTO_OR_PULSE_STEP_TYPES array');
  process.exit(1);
}
const block = cw.slice(start, end);
const types = [];
const strRe = /'([a-zA-Z][a-zA-Z0-9_]*)'/g;
let m;
while ((m = strRe.exec(block)) !== null) {
  types.push(m[1]);
}
const typeSet = new Set(types);
if (types.length === 0) {
  console.error('verify-crypto-workflow-step-types: parsed zero types');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'));
const steps = Array.isArray(manifest.steps) ? manifest.steps : [];
const manifestSet = new Set(steps);

for (const t of types) {
  if (!manifestSet.has(t)) {
    console.error('verify-crypto-workflow-step-types: allowlisted type missing from manifest:', t);
    process.exit(1);
  }
}

function manifestStepLooksCryptoOrPulse(s) {
  if (s === 'rugcheckToken' || s === 'selectFollowingAccount') return true;
  if (/^solana/i.test(s)) return true;
  if (/^bsc/i.test(s)) return true;
  if (/^raydium/i.test(s)) return true;
  if (/^meteora/i.test(s)) return true;
  if (/^aster/i.test(s)) return true;
  if (/^watchActivity/i.test(s)) return true;
  return false;
}

for (const s of steps) {
  if (manifestStepLooksCryptoOrPulse(s) && !typeSet.has(s)) {
    console.error(
      'verify-crypto-workflow-step-types: manifest step looks crypto/Pulse but is missing from crypto-workflow-step-ids:',
      s,
    );
    process.exit(1);
  }
}

console.log('verify-crypto-workflow-step-types: OK');
process.exit(0);
