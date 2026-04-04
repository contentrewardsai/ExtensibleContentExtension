#!/usr/bin/env node
/**
 * EVM JSON-RPC smoke: Anvil fork, public BSC/Chapel, or any eth_* endpoint.
 * Env: CRYPTO_EVM_FORK_RPC_URL — default http://127.0.0.1:8545
 *
 * Runs eth_chainId + net_version (must agree), genesis block hash (56/97 canonical), latest block, eth_blockNumber, eth_gasPrice, eth_syncing, then
 * eth_getCode: chain 56 router + WBNB + Infinity Vault mainnet (+ eth_call WBNB.decimals);
 * chain 97 Infinity Vault + BinPoolManager Chapel.
 * Exit 0 on success; does not send transactions.
 */
import process from 'node:process';

const url = (process.env.CRYPTO_EVM_FORK_RPC_URL || 'http://127.0.0.1:8545').trim();

/** Same as background/bsc-evm.js PANCAKE_ROUTER_V2 — proves mainnet/fork sees DEX bytecode. */
const PANCAKE_V2_ROUTER_BSC = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
/** Same as background/bsc-evm.js WBNB_BSC. */
const WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
/** Same as background/bsc-evm.js INFI_VAULT_BSC. */
const INFI_VAULT_BSC = '0x238a358808379702088667322f80aC48bAd5e6c4';
/** Same as background/bsc-evm.js INFI_VAULT_CHAPEL — extension uses this on chain 97. */
const INFI_VAULT_CHAPEL = '0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD';
/** Same as background/bsc-evm.js INFI_BIN_POOL_MANAGER_CHAPEL. */
const INFI_BIN_POOL_MANAGER_CHAPEL = '0xe71d2e0230cE0765be53A8A1ee05bdACF30F296B';

/** ERC20 decimals() selector */
const ERC20_DECIMALS_DATA = '0x313ce567';

const GENESIS_HASH_BSC_56 = '0x0d21840abff46b96c84b2ac9e10e4f5cdaeb5693cb665db62a2f3b02d2d57b5b';
const GENESIS_HASH_BSC_97 = '0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34';

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
  let client = '';
  try {
    client = await rpc('web3_clientVersion', []);
  } catch {
    /* optional */
  }
  const chainId = await rpc('eth_chainId');
  const cidEarly = parseChainIdHex(chainId);
  if (cidEarly == null || cidEarly <= 0) {
    throw new Error(`eth_chainId invalid ${JSON.stringify(chainId)}`);
  }
  const netVerRaw = await rpc('net_version', []);
  const netVid = parseInt(String(netVerRaw != null ? netVerRaw : ''), 10);
  if (!Number.isFinite(netVid) || netVid <= 0) {
    throw new Error(`net_version unexpected ${JSON.stringify(netVerRaw)}`);
  }
  if (netVid !== cidEarly) {
    throw new Error(`net_version ${netVid} does not match eth_chainId ${cidEarly} (${chainId})`);
  }
  console.log('[crypto-evm-fork-smoke] net_version:', String(netVerRaw), '(matches chainId)');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  const blockNum = await rpc('eth_blockNumber', []);
  console.log('[crypto-evm-fork-smoke] url:', url);
  if (client) console.log('[crypto-evm-fork-smoke] client:', client);
  console.log('[crypto-evm-fork-smoke] eth_chainId:', chainId);
  console.log('[crypto-evm-fork-smoke] latest block:', block?.number ?? '(null)');
  console.log('[crypto-evm-fork-smoke] eth_blockNumber:', blockNum);
  const gasPrice = await rpc('eth_gasPrice', []);
  if (typeof gasPrice !== 'string' || !/^0x[0-9a-fA-F]+$/.test(gasPrice) || parseInt(gasPrice, 16) <= 0) {
    throw new Error(`eth_gasPrice unexpected ${JSON.stringify(gasPrice)}`);
  }
  console.log('[crypto-evm-fork-smoke] eth_gasPrice:', gasPrice);
  const syncing = await rpc('eth_syncing', []);
  if (syncing !== false) {
    throw new Error(`eth_syncing expected false, got ${JSON.stringify(syncing)}`);
  }
  console.log('[crypto-evm-fork-smoke] eth_syncing: false');

  const gen = await rpc('eth_getBlockByNumber', ['0x0', false]);
  const ghash = gen && gen.hash;
  if (typeof ghash !== 'string' || !/^0x[0-9a-fA-F]{64}$/i.test(ghash)) {
    throw new Error(`genesis hash unexpected ${JSON.stringify(ghash)}`);
  }
  const cidForGen = parseChainIdHex(chainId);
  const wantGen = cidForGen === 56 ? GENESIS_HASH_BSC_56 : cidForGen === 97 ? GENESIS_HASH_BSC_97 : null;
  if (wantGen && ghash.toLowerCase() !== wantGen.toLowerCase()) {
    throw new Error(`genesis hash ${ghash} does not match canonical chain ${cidForGen}`);
  }
  if (wantGen) console.log('[crypto-evm-fork-smoke] genesis hash: ok (chain', cidForGen + ')');
  else console.log('[crypto-evm-fork-smoke] genesis hash:', ghash, '(no canonical check)');

  const cid = parseChainIdHex(chainId);
  const probes =
    cid === 56
      ? [
          [PANCAKE_V2_ROUTER_BSC, 'Pancake V2 router (mainnet)'],
          [WBNB_BSC, 'WBNB (mainnet)'],
          [INFI_VAULT_BSC, 'Infinity Vault (mainnet)'],
        ]
      : cid === 97
        ? [
            [INFI_VAULT_CHAPEL, 'Infinity Vault (Chapel)'],
            [INFI_BIN_POOL_MANAGER_CHAPEL, 'Infinity BinPoolManager (Chapel)'],
          ]
        : [];
  if (probes.length) {
    for (const [addr, label] of probes) {
      const code = await rpc('eth_getCode', [addr, 'latest']);
      if (typeof code !== 'string' || code === '0x' || code.length < 10) {
        throw new Error(`eth_getCode ${addr} (${label}) empty or missing — wrong chain or RPC?`);
      }
      console.log(`[crypto-evm-fork-smoke] eth_getCode ${label}: ok (${code.length} chars)`);
    }
  } else {
    console.log('[crypto-evm-fork-smoke] skip eth_getCode probe (chain not 56 or 97)');
  }

  if (cid === 56) {
    const raw = await rpc('eth_call', [{ to: WBNB_BSC, data: ERC20_DECIMALS_DATA }, 'latest']);
    if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]+$/.test(raw) || raw.length < 66) {
      throw new Error(`eth_call WBNB.decimals unexpected ${JSON.stringify(raw)}`);
    }
    const dec = parseInt(raw.slice(-64), 16);
    if (dec !== 18) throw new Error(`WBNB decimals expected 18, got ${dec}`);
    console.log('[crypto-evm-fork-smoke] eth_call WBNB.decimals: 18');
  }
}

main().catch((e) => {
  console.error('[crypto-evm-fork-smoke]', e.message || e);
  console.error('Hint: start Anvil fork, e.g. anvil --fork-url <BSC_HTTPS_RPC> --port 8545');
  process.exit(1);
});
