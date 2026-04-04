#!/usr/bin/env node
/**
 * Optional read-only RPC smoke checks for CI when repository secrets are set.
 * Does nothing (exit 0) when no URLs are configured — default PR/push workflows stay secret-free.
 *
 * Env (GitHub Actions: repository secrets):
 *   SOLANA_RPC_SMOKE_URL — HTTPS JSON-RPC URL (e.g. devnet/mainnet provider)
 *   BSC_RPC_SMOKE_URL    — HTTPS JSON-RPC URL (e.g. Chapel or mainnet)
 *
 * See docs/CRYPTO_CI_SMOKE.md
 */
import process from 'node:process';

const solUrl = (process.env.SOLANA_RPC_SMOKE_URL || '').trim();
const bscUrl = (process.env.BSC_RPC_SMOKE_URL || '').trim();

/** Canonical genesis block hashes (eth_getBlockByNumber("0x0").hash). */
const GENESIS_HASH_BSC_56 = '0x0d21840abff46b96c84b2ac9e10e4f5cdaeb5693cb665db62a2f3b02d2d57b5b';
const GENESIS_HASH_BSC_97 = '0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34';

const SOLANA_GENESIS_MAINNET = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const SOLANA_GENESIS_DEVNET = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const SOLANA_GENESIS_TESTNET = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';

function expectedSolanaGenesisFromUrl(rpcUrl) {
  const override = (process.env.SOLANA_EXPECTED_GENESIS_HASH || '').trim();
  if (override) return override;
  try {
    const host = new URL(rpcUrl).hostname.toLowerCase();
    if (host.includes('devnet')) return SOLANA_GENESIS_DEVNET;
    if (host.includes('testnet')) return SOLANA_GENESIS_TESTNET;
    if (host.includes('mainnet') || host === 'api.solana.com' || host.endsWith('.solana.com')) {
      return SOLANA_GENESIS_MAINNET;
    }
  } catch (_) {}
  return null;
}

if (!solUrl && !bscUrl) {
  console.log('[crypto-rpc-smoke] skip: set SOLANA_RPC_SMOKE_URL and/or BSC_RPC_SMOKE_URL to run');
  process.exit(0);
}

async function postJson(url, body, label) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label}: non-JSON HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (json.error) {
    throw new Error(`${label}: JSON-RPC error ${JSON.stringify(json.error)}`);
  }
  return json;
}

async function main() {
  if (solUrl) {
    const r = await postJson(
      solUrl,
      { jsonrpc: '2.0', id: 1, method: 'getHealth' },
      'Solana'
    );
    const status = r.result;
    if (status !== 'ok') {
      throw new Error(`Solana: getHealth expected "ok", got ${JSON.stringify(status)}`);
    }
    console.log('[crypto-rpc-smoke] Solana getHealth: ok');
    const slot = await postJson(
      solUrl,
      { jsonrpc: '2.0', id: 2, method: 'getSlot' },
      'Solana getSlot'
    );
    if (typeof slot.result !== 'number' && typeof slot.result !== 'string') {
      throw new Error(`Solana: getSlot unexpected ${JSON.stringify(slot.result)}`);
    }
    console.log('[crypto-rpc-smoke] Solana getSlot:', slot.result);
    const lb = await postJson(
      solUrl,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'finalized' }],
      },
      'Solana getLatestBlockhash'
    );
    const v = lb.result && lb.result.value;
    const bh = v && v.blockhash;
    if (typeof bh !== 'string' || bh.length < 32) {
      throw new Error(`Solana: getLatestBlockhash unexpected ${JSON.stringify(lb.result)}`);
    }
    console.log('[crypto-rpc-smoke] Solana getLatestBlockhash: ok (len ' + bh.length + ')');
    const ver = await postJson(
      solUrl,
      { jsonrpc: '2.0', id: 4, method: 'getVersion' },
      'Solana getVersion'
    );
    const vr = ver.result;
    if (!vr || typeof vr !== 'object') {
      throw new Error(`Solana: getVersion unexpected ${JSON.stringify(ver.result)}`);
    }
    const core = vr['solana-core'] || vr.solanaCore;
    if (typeof core !== 'string' || !core.length) {
      throw new Error(`Solana: getVersion missing solana-core ${JSON.stringify(vr)}`);
    }
    console.log('[crypto-rpc-smoke] Solana getVersion solana-core:', core);
    const ep = await postJson(
      solUrl,
      { jsonrpc: '2.0', id: 5, method: 'getEpochInfo' },
      'Solana getEpochInfo'
    );
    const ei = ep.result;
    if (!ei || typeof ei !== 'object') {
      throw new Error(`Solana: getEpochInfo unexpected ${JSON.stringify(ep.result)}`);
    }
    const epoch = ei.epoch;
    const slotIdx = ei.slotIndex;
    if (
      (typeof epoch !== 'number' && typeof epoch !== 'string') ||
      (typeof slotIdx !== 'number' && typeof slotIdx !== 'string')
    ) {
      throw new Error(`Solana: getEpochInfo missing epoch/slotIndex ${JSON.stringify(ei)}`);
    }
    console.log('[crypto-rpc-smoke] Solana getEpochInfo epoch:', epoch, 'slotIndex:', slotIdx);
    const expGh = expectedSolanaGenesisFromUrl(solUrl);
    if (expGh) {
      const gh = await postJson(
        solUrl,
        { jsonrpc: '2.0', id: 6, method: 'getGenesisHash' },
        'Solana getGenesisHash'
      );
      const h = gh.result;
      if (typeof h !== 'string' || h !== expGh) {
        throw new Error(`Solana: getGenesisHash expected ${expGh}, got ${JSON.stringify(h)}`);
      }
      console.log('[crypto-rpc-smoke] Solana getGenesisHash: ok (matches cluster hint)');
    } else {
      console.log('[crypto-rpc-smoke] Solana skip getGenesisHash (set SOLANA_EXPECTED_GENESIS_HASH or use devnet/testnet/mainnet host)');
    }
  }

  if (bscUrl) {
    const r = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      'BSC'
    );
    const hex = r.result;
    if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hex)) {
      throw new Error(`BSC: unexpected eth_chainId ${JSON.stringify(hex)}`);
    }
    console.log('[crypto-rpc-smoke] BSC eth_chainId:', hex);
    const cidFromHex = parseInt(hex, 16);
    if (!Number.isFinite(cidFromHex) || cidFromHex <= 0) {
      throw new Error(`BSC: eth_chainId parse failed ${hex}`);
    }
    const nv = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 2, method: 'net_version', params: [] },
      'BSC net_version'
    );
    const nvr = nv.result;
    const nid = parseInt(String(nvr != null ? nvr : ''), 10);
    if (!Number.isFinite(nid) || nid <= 0) {
      throw new Error(`BSC: net_version unexpected ${JSON.stringify(nvr)}`);
    }
    if (nid !== cidFromHex) {
      throw new Error(`BSC: net_version ${nid} does not match eth_chainId ${cidFromHex} (${hex})`);
    }
    console.log('[crypto-rpc-smoke] BSC net_version:', String(nvr), '(matches chainId)');
    const bn = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 3, method: 'eth_blockNumber', params: [] },
      'BSC eth_blockNumber'
    );
    const n = bn.result;
    if (typeof n !== 'string' || !/^0x[0-9a-fA-F]+$/.test(n)) {
      throw new Error(`BSC: unexpected eth_blockNumber ${JSON.stringify(n)}`);
    }
    console.log('[crypto-rpc-smoke] BSC eth_blockNumber:', n);
    const gp = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 4, method: 'eth_gasPrice', params: [] },
      'BSC eth_gasPrice'
    );
    const gpx = gp.result;
    if (typeof gpx !== 'string' || !/^0x[0-9a-fA-F]+$/.test(gpx)) {
      throw new Error(`BSC: unexpected eth_gasPrice ${JSON.stringify(gpx)}`);
    }
    const gasWei = parseInt(gpx, 16);
    if (!Number.isFinite(gasWei) || gasWei <= 0) {
      throw new Error(`BSC: eth_gasPrice not positive ${gpx}`);
    }
    console.log('[crypto-rpc-smoke] BSC eth_gasPrice:', gpx);
    const sync = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 6, method: 'eth_syncing', params: [] },
      'BSC eth_syncing'
    );
    if (sync.result !== false) {
      throw new Error(`BSC: eth_syncing expected false, got ${JSON.stringify(sync.result)}`);
    }
    console.log('[crypto-rpc-smoke] BSC eth_syncing: false');

    const gen = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 8, method: 'eth_getBlockByNumber', params: ['0x0', false] },
      'BSC genesis block'
    );
    const gh = gen.result && gen.result.hash;
    if (typeof gh !== 'string' || !/^0x[0-9a-fA-F]{64}$/i.test(gh)) {
      throw new Error(`BSC: genesis hash unexpected ${JSON.stringify(gh)}`);
    }
    const want =
      cidFromHex === 56 ? GENESIS_HASH_BSC_56 : cidFromHex === 97 ? GENESIS_HASH_BSC_97 : null;
    if (want && gh.toLowerCase() !== want.toLowerCase()) {
      throw new Error(`BSC: genesis hash ${gh} does not match canonical chain ${cidFromHex}`);
    }
    if (want) {
      console.log('[crypto-rpc-smoke] BSC genesis hash: ok (chain', cidFromHex + ')');
    } else {
      console.log('[crypto-rpc-smoke] BSC genesis hash:', gh, '(no canonical check for chain', cidFromHex + ')');
    }

    const cid = cidFromHex;
    /** ERC20 decimals() — same WBNB mainnet pin as bsc-evm.js (chain 56 only). */
    const WBNB_MAINNET = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const DECIMALS_SEL = '0x313ce567';
    if (cid === 56) {
      const call = await postJson(
        bscUrl,
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'eth_call',
          params: [{ to: WBNB_MAINNET, data: DECIMALS_SEL }, 'latest'],
        },
        'BSC eth_call WBNB.decimals'
      );
      const raw = call.result;
      if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]+$/.test(raw) || raw.length < 66) {
        throw new Error(`BSC: WBNB decimals() unexpected ${JSON.stringify(raw)}`);
      }
      const dec = parseInt(raw.slice(-64), 16);
      if (dec !== 18) {
        throw new Error(`BSC: WBNB decimals expected 18, got ${dec}`);
      }
      console.log('[crypto-rpc-smoke] BSC eth_call WBNB.decimals: 18');
    } else {
      console.log('[crypto-rpc-smoke] BSC skip eth_call WBNB.decimals (chain not 56)');
    }
  }
}

main().catch((e) => {
  console.error('[crypto-rpc-smoke]', e.message || e);
  process.exit(1);
});
