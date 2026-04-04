#!/usr/bin/env node
/**
 * Guard: BSC canonical genesis hashes in crypto-rpc-smoke.mjs and
 * crypto-evm-fork-smoke.mjs stay identical (single source of truth in practice).
 *
 * Run: node scripts/verify-crypto-bsc-genesis-sync.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const paths = {
  rpc: path.join(root, 'scripts', 'crypto-rpc-smoke.mjs'),
  fork: path.join(root, 'scripts', 'crypto-evm-fork-smoke.mjs'),
};

for (const [k, p] of Object.entries(paths)) {
  if (!fs.existsSync(p)) {
    console.error('verify-crypto-bsc-genesis-sync: missing', k, path.relative(root, p));
    process.exit(1);
  }
}

const re56 = /const\s+GENESIS_HASH_BSC_56\s*=\s*['"](0x[a-fA-F0-9]{64})['"]/;
const re97 = /const\s+GENESIS_HASH_BSC_97\s*=\s*['"](0x[a-fA-F0-9]{64})['"]/;

function parseBoth(filePath) {
  const s = fs.readFileSync(filePath, 'utf8');
  const m56 = s.match(re56);
  const m97 = s.match(re97);
  if (!m56 || !m97) {
    console.error('verify-crypto-bsc-genesis-sync: could not parse genesis constants in', path.relative(root, filePath));
    process.exit(1);
  }
  return { h56: m56[1].toLowerCase(), h97: m97[1].toLowerCase() };
}

const rpc = parseBoth(paths.rpc);
const fork = parseBoth(paths.fork);

if (rpc.h56 !== fork.h56 || rpc.h97 !== fork.h97) {
  console.error('verify-crypto-bsc-genesis-sync: mismatch');
  console.error('  rpc-smoke 56:', rpc.h56, 'fork 56:', fork.h56);
  console.error('  rpc-smoke 97:', rpc.h97, 'fork 97:', fork.h97);
  process.exit(1);
}

console.log('verify-crypto-bsc-genesis-sync: OK (rpc-smoke and fork-smoke genesis pins match)');
process.exit(0);
