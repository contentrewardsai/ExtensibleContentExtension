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
  }
}

main().catch((e) => {
  console.error('[crypto-rpc-smoke]', e.message || e);
  process.exit(1);
});
