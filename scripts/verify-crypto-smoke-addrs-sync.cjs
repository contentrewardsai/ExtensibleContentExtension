#!/usr/bin/env node
/**
 * Guard: BSC addresses in crypto-evm-fork-smoke.mjs match background/bsc-evm.js:
 * Pancake V2 router (56), Infinity Vault + BinPoolManager Chapel (97).
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

const evmVault = evm.match(/var\s+INFI_VAULT_CHAPEL\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!evmVault) {
  console.error('verify-crypto-smoke-addrs-sync: could not parse INFI_VAULT_CHAPEL from bsc-evm.js');
  process.exit(1);
}
const vaultEvm = evmVault[1].toLowerCase();

const smokeVaultM = smoke.match(/const\s+INFI_VAULT_CHAPEL\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!smokeVaultM) {
  console.error('verify-crypto-smoke-addrs-sync: could not parse INFI_VAULT_CHAPEL in crypto-evm-fork-smoke.mjs');
  process.exit(1);
}
const vaultSmoke = smokeVaultM[1].toLowerCase();

if (vaultEvm !== vaultSmoke) {
  console.error(
    'verify-crypto-smoke-addrs-sync: INFI_VAULT_CHAPEL mismatch',
    '\n  bsc-evm.js:              ',
    vaultEvm,
    '\n  crypto-evm-fork-smoke:   ',
    vaultSmoke,
  );
  process.exit(1);
}

const evmPm = evm.match(/var\s+INFI_BIN_POOL_MANAGER_CHAPEL\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!evmPm) {
  console.error('verify-crypto-smoke-addrs-sync: could not parse INFI_BIN_POOL_MANAGER_CHAPEL from bsc-evm.js');
  process.exit(1);
}
const pmEvm = evmPm[1].toLowerCase();

const smokePmM = smoke.match(/const\s+INFI_BIN_POOL_MANAGER_CHAPEL\s*=\s*['"](0x[a-fA-F0-9]{40})['"]/);
if (!smokePmM) {
  console.error('verify-crypto-smoke-addrs-sync: could not parse INFI_BIN_POOL_MANAGER_CHAPEL in crypto-evm-fork-smoke.mjs');
  process.exit(1);
}
const pmSmoke = smokePmM[1].toLowerCase();

if (pmEvm !== pmSmoke) {
  console.error(
    'verify-crypto-smoke-addrs-sync: INFI_BIN_POOL_MANAGER_CHAPEL mismatch',
    '\n  bsc-evm.js:              ',
    pmEvm,
    '\n  crypto-evm-fork-smoke:   ',
    pmSmoke,
  );
  process.exit(1);
}

console.log('verify-crypto-smoke-addrs-sync: OK (router + Chapel Infinity pins match bsc-evm.js)');
process.exit(0);
