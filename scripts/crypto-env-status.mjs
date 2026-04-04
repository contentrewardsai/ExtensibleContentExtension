#!/usr/bin/env node
/**
 * Print which optional crypto test env vars are set (no network I/O).
 * Run: node scripts/crypto-env-status.mjs
 */
import process from 'node:process';

const keys = [
  'CRYPTO_HTTP_SMOKE_RUN',
  'CRYPTO_HTTP_SMOKE',
  'CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY',
  'CRYPTO_HTTP_SMOKE_BSCSCAN_NETWORK',
  'CRYPTO_HTTP_SMOKE_RUGCHECK_MINT',
  'SOLANA_RPC_SMOKE_URL',
  'SOLANA_EXPECTED_GENESIS_HASH',
  'CRYPTO_SOLANA_TX_RPC_URL',
  'CRYPTO_SOLANA_TX_SECRET_KEY',
  'CRYPTO_SOLANA_TX_FORCE',
  'BSC_RPC_SMOKE_URL',
  'CRYPTO_EVM_FORK_RPC_URL',
  'CRYPTO_EVM_FORK_TX_RPC_URL',
  'CRYPTO_EVM_FORK_TX_FORCE',
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
  const display =
    k === 'CRYPTO_SOLANA_TX_SECRET_KEY' || k === 'CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY'
      ? set
        ? '(set — value hidden)'
        : '(not set)'
      : set
        ? mask(String(v))
        : '(not set)';
  console.log(`  ${k}: ${display}`);
}
console.log(
  '\nCommands: npm run test:crypto-http-smoke | npm run test:crypto-rpc-smoke | npm run test:crypto-solana-tx-smoke | npm run test:crypto-evm-fork-smoke | npm run test:crypto-evm-fork-tx-smoke'
);
console.log('Docs: docs/CRYPTO_TESTING_QUICKREF.md');
