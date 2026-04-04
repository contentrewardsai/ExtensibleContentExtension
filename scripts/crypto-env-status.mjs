#!/usr/bin/env node
/**
 * Print which optional crypto test env vars are set (no network I/O).
 * Run: node scripts/crypto-env-status.mjs
 */
import process from 'node:process';

const keys = [
  'SOLANA_RPC_SMOKE_URL',
  'BSC_RPC_SMOKE_URL',
  'CRYPTO_EVM_FORK_RPC_URL',
  'BSC_FORK_URL',
  'ANVIL_PORT',
  'ANVIL_BLOCK',
];

function mask(v) {
  if (!v || typeof v !== 'string') return '(empty)';
  const t = v.trim();
  if (t.length <= 24) return t;
  return t.slice(0, 20) + '…' + t.slice(-4);
}

console.log('Optional crypto test environment (set in shell or CI secrets):\n');
for (const k of keys) {
  const v = process.env[k];
  const set = v != null && String(v).trim() !== '';
  console.log(`  ${k}: ${set ? mask(String(v)) : '(not set)'}`);
}
console.log('\nCommands: npm run test:crypto-rpc-smoke | npm run test:crypto-evm-fork-smoke');
console.log('Docs: docs/CRYPTO_TESTING_QUICKREF.md');
