#!/usr/bin/env node
/**
 * Guard: BSC canonical genesis hashes live in scripts/crypto-constants.json and
 * both smoke runners load them (no duplicated literals in the runners).
 *
 * Run: node scripts/verify-crypto-bsc-genesis-sync.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const constantsPath = path.join(root, 'scripts', 'crypto-constants.json');
const paths = {
  rpc: path.join(root, 'scripts', 'crypto-rpc-smoke.mjs'),
  fork: path.join(root, 'scripts', 'crypto-evm-fork-smoke.mjs'),
};

if (!fs.existsSync(constantsPath)) {
  console.error('verify-crypto-bsc-genesis-sync: missing', path.relative(root, constantsPath));
  process.exit(1);
}

let constants;
try {
  constants = JSON.parse(fs.readFileSync(constantsPath, 'utf8'));
} catch (e) {
  console.error('verify-crypto-bsc-genesis-sync: invalid JSON', path.relative(root, constantsPath), e.message);
  process.exit(1);
}

const h56 = constants.bsc && constants.bsc.genesisBlockHashChain56;
const h97 = constants.bsc && constants.bsc.genesisBlockHashChain97;
const re64 = /^0x[a-fA-F0-9]{64}$/;
if (typeof h56 !== 'string' || typeof h97 !== 'string' || !re64.test(h56) || !re64.test(h97)) {
  console.error('verify-crypto-bsc-genesis-sync: crypto-constants.json missing valid bsc genesis hashes');
  process.exit(1);
}

const deprecated = /const\s+GENESIS_HASH_BSC_(56|97)\s*=\s*['"]0x[a-fA-F0-9]{64}['"]/;

for (const [k, p] of Object.entries(paths)) {
  if (!fs.existsSync(p)) {
    console.error('verify-crypto-bsc-genesis-sync: missing', k, path.relative(root, p));
    process.exit(1);
  }
  const s = fs.readFileSync(p, 'utf8');
  if (!s.includes('crypto-constants.json')) {
    console.error('verify-crypto-bsc-genesis-sync:', path.relative(root, p), 'must load scripts/crypto-constants.json');
    process.exit(1);
  }
  if (!s.includes('genesisBlockHashChain56') || !s.includes('genesisBlockHashChain97')) {
    console.error('verify-crypto-bsc-genesis-sync:', path.relative(root, p), 'must read bsc genesis keys from constants');
    process.exit(1);
  }
  if (deprecated.test(s)) {
    console.error('verify-crypto-bsc-genesis-sync:', path.relative(root, p), 'must not duplicate GENESIS_HASH_BSC_* literals');
    process.exit(1);
  }
}

console.log(
  'verify-crypto-bsc-genesis-sync: OK (BSC genesis in crypto-constants.json; rpc + fork smoke load it)'
);
process.exit(0);
