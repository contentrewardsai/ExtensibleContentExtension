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
    const bn = await postJson(
      bscUrl,
      { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
      'BSC eth_blockNumber'
    );
    const n = bn.result;
    if (typeof n !== 'string' || !/^0x[0-9a-fA-F]+$/.test(n)) {
      throw new Error(`BSC: unexpected eth_blockNumber ${JSON.stringify(n)}`);
    }
    console.log('[crypto-rpc-smoke] BSC eth_blockNumber:', n);

    const cid = parseInt(hex, 16);
    /** ERC20 decimals() — same WBNB mainnet pin as bsc-evm.js (chain 56 only). */
    const WBNB_MAINNET = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const DECIMALS_SEL = '0x313ce567';
    if (cid === 56) {
      const call = await postJson(
        bscUrl,
        {
          jsonrpc: '2.0',
          id: 3,
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
