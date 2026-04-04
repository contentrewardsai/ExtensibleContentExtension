#!/usr/bin/env node
/**
 * Guard: BSC addresses hard-coded in crypto-evm-fork-smoke.mjs stay aligned with
 * background/bsc-evm.js (Pancake V2 router) so fork smoke probes the same contract
 * the extension uses on chain 56.
 *
 * Run: node scripts/verify-crypto-smoke-addrs-sync.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const evmPath = path.join(root, 'background', 'bsc-evm.js');
const smokePath = path.join(root, 'scripts', 'crypto-evm-fork-smoke.mjs');

for (const p of [evmPath, smokePath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-crypto-smoke-addrs-sync: missing', path.relative(root, p));
    process.exit(1);
  }
}

const evm = fs.readFileSync(evmPath, 'utf8');
const smoke = fs.readFileSync(smokePath, 'utf8');

const evmM = evm.match(/var\s+PANCAKE_ROUTER_V2\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!evmM) {
  console.error('verify-crypto-smoke-addrs-sync: could not parse PANCAKE_ROUTER_V2 from bsc-evm.js');
  process.exit(1);
}
const routerEvm = evmM[1].toLowerCase();

const smokeM = smoke.match(/const\s+PANCAKE_V2_ROUTER_BSC\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!smokeM) {
  console.error('verify-crypto-smoke-addrs-sync: could not parse PANCAKE_V2_ROUTER_BSC from crypto-evm-fork-smoke.mjs');
  process.exit(1);
}
const routerSmoke = smokeM[1].toLowerCase();

if (routerEvm !== routerSmoke) {
  console.error(
    'verify-crypto-smoke-addrs-sync: Pancake V2 router mismatch',
    '\n  bsc-evm.js:              ',
    routerEvm,
    '\n  crypto-evm-fork-smoke:   ',
    routerSmoke,
    '\n  Update scripts/crypto-evm-fork-smoke.mjs to match background/bsc-evm.js',
  );
  process.exit(1);
}

const chapelM = smoke.match(/const\s+WBNB_CHAPEL\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!chapelM || !/^0x[a-fA-F0-9]{40}$/i.test(chapelM[1])) {
  console.error('verify-crypto-smoke-addrs-sync: invalid WBNB_CHAPEL in crypto-evm-fork-smoke.mjs');
  process.exit(1);
}

console.log('verify-crypto-smoke-addrs-sync: OK (Pancake V2 router matches bsc-evm.js)');
process.exit(0);
