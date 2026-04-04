#!/usr/bin/env node
/**
 * Guard: docs/BSC_PANCAKE_ADDRESSES.md contains the same mainnet pins as
 * background/bsc-evm.js (prevents doc drift from code).
 *
 * Run: node scripts/verify-bsc-pancake-docs-sync.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const evmPath = path.join(root, 'background', 'bsc-evm.js');
const docPath = path.join(root, 'docs', 'BSC_PANCAKE_ADDRESSES.md');

for (const p of [evmPath, docPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-bsc-pancake-docs-sync: missing', path.relative(root, p));
    process.exit(1);
  }
}

const evm = fs.readFileSync(evmPath, 'utf8');
const doc = fs.readFileSync(docPath, 'utf8');
const docLower = doc.toLowerCase();

/** BSC mainnet constants that must appear in the doc table. */
const VARS = [
  'PANCAKE_ROUTER_V2',
  'PANCAKE_FACTORY_V2',
  'PANCAKE_FACTORY_V3',
  'PANCAKE_QUOTER_V2',
  'PANCAKE_SWAP_ROUTER_V3',
  'PANCAKE_NPM_V3',
  'WBNB_BSC',
  'MASTER_CHEF_V1',
  'MASTER_CHEF_V2',
  'INFI_VAULT_BSC',
  'INFI_BIN_POOL_MANAGER_BSC',
  'INFI_BIN_POSITION_MANAGER_BSC',
  'INFI_BIN_QUOTER_BSC',
  'INFI_FARMING_DISTRIBUTOR_BSC',
  'INFI_CAMPAIGN_MANAGER_BSC',
  'PERMIT2_UNIVERSAL',
];

/** Chapel (97) Infinity pins — documented in second table. */
const CHAPEL_VARS = [
  'INFI_BIN_POOL_MANAGER_CHAPEL',
  'INFI_BIN_POSITION_MANAGER_CHAPEL',
  'INFI_BIN_QUOTER_CHAPEL',
  'INFI_VAULT_CHAPEL',
  'INFI_FARMING_DISTRIBUTOR_CHAPEL',
];

function parseVar(src, name) {
  const re = new RegExp(`var\\s+${name}\\s*=\\s*['"](0x[a-fA-F0-9]{40})['"]`);
  const m = src.match(re);
  return m ? m[1].toLowerCase() : null;
}

function checkList(list, sectionLabel) {
  for (const v of list) {
    const addr = parseVar(evm, v);
    if (!addr) {
      console.error('verify-bsc-pancake-docs-sync: could not parse', v, 'from bsc-evm.js');
      process.exit(1);
    }
    if (!docLower.includes(addr)) {
      console.error(
        'verify-bsc-pancake-docs-sync:',
        sectionLabel,
        '- address for',
        v,
        '(' + addr + ') missing from docs/BSC_PANCAKE_ADDRESSES.md',
      );
      process.exit(1);
    }
  }
}

checkList(VARS, 'mainnet');
checkList(CHAPEL_VARS, 'Chapel');

console.log('verify-bsc-pancake-docs-sync: OK (doc matches bsc-evm.js pins)');
process.exit(0);
