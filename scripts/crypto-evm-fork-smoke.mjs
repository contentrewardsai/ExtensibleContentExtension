#!/usr/bin/env node
/**
 * EVM JSON-RPC smoke: Anvil fork, public BSC/Chapel, or any eth_* endpoint.
 * Env: CRYPTO_EVM_FORK_RPC_URL — default http://127.0.0.1:8545
 *
 * Runs eth_chainId, eth_getBlockByNumber("latest"), eth_blockNumber, then
 * eth_getCode on a known contract for chain 56 (Pancake V2 router) or 97 (WBNB Chapel).
 * Exit 0 on success; does not send transactions.
 */
import process from 'node:process';

const url = (process.env.CRYPTO_EVM_FORK_RPC_URL || 'http://127.0.0.1:8545').trim();

/** Same as background/bsc-evm.js PANCAKE_ROUTER_V2 — proves mainnet/fork sees DEX bytecode. */
const PANCAKE_V2_ROUTER_BSC = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
/** Wrapped BNB on BSC Chapel (common testnet deployment). */
const WBNB_CHAPEL = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';

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

function parseChainIdHex(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hex)) return null;
  return parseInt(hex, 16);
}

async function main() {
  const chainId = await rpc('eth_chainId');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  const blockNum = await rpc('eth_blockNumber', []);
  console.log('[crypto-evm-fork-smoke] url:', url);
  console.log('[crypto-evm-fork-smoke] eth_chainId:', chainId);
  console.log('[crypto-evm-fork-smoke] latest block:', block?.number ?? '(null)');
  console.log('[crypto-evm-fork-smoke] eth_blockNumber:', blockNum);

  const cid = parseChainIdHex(chainId);
  let probe = null;
  let label = '';
  if (cid === 56) {
    probe = PANCAKE_V2_ROUTER_BSC;
    label = 'Pancake V2 router (mainnet)';
  } else if (cid === 97) {
    probe = WBNB_CHAPEL;
    label = 'WBNB (Chapel)';
  }
  if (probe) {
    const code = await rpc('eth_getCode', [probe, 'latest']);
    if (typeof code !== 'string' || code === '0x' || code.length < 10) {
      throw new Error(`eth_getCode ${probe} (${label}) empty or missing — wrong chain or RPC?`);
    }
    console.log(`[crypto-evm-fork-smoke] eth_getCode ${label}: ok (${code.length} chars)`);
  } else {
    console.log('[crypto-evm-fork-smoke] skip eth_getCode probe (chain not 56 or 97)');
  }
}

main().catch((e) => {
  console.error('[crypto-evm-fork-smoke]', e.message || e);
  console.error('Hint: start Anvil fork, e.g. anvil --fork-url <BSC_HTTPS_RPC> --port 8545');
  process.exit(1);
});
