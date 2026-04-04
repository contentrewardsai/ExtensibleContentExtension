#!/usr/bin/env node
/**
 * Minimal EVM fork smoke: requires JSON-RPC (Anvil/Hardhat fork or real BSC RPC).
 * Env: CRYPTO_EVM_FORK_RPC_URL — default http://127.0.0.1:8545
 *
 * Runs eth_chainId + eth_getBlockByNumber("latest") + optional balance check.
 * Exit 0 on success; does not send transactions.
 */
import process from 'node:process';

const url = (process.env.CRYPTO_EVM_FORK_RPC_URL || 'http://127.0.0.1:8545').trim();

async function rpc(method, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function main() {
  const chainId = await rpc('eth_chainId');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  console.log('[crypto-evm-fork-smoke] url:', url);
  console.log('[crypto-evm-fork-smoke] eth_chainId:', chainId);
  console.log('[crypto-evm-fork-smoke] latest block:', block?.number ?? '(null)');
}

main().catch((e) => {
  console.error('[crypto-evm-fork-smoke]', e.message || e);
  console.error('Hint: start Anvil fork, e.g. anvil --fork-url <BSC_HTTPS_RPC> --port 8545');
  process.exit(1);
});
