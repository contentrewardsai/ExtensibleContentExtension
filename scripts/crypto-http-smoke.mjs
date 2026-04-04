#!/usr/bin/env node
/**
 * Optional read-only HTTP smoke for third-party APIs used by Pulse / crypto paths.
 * Exits 0 with a skip message when nothing is enabled (no accidental CI network by default).
 *
 * Enable (any of):
 *   CRYPTO_HTTP_SMOKE_RUN        — non-empty (e.g. CI secret "1") → Rugcheck + Aster + Jupiter quote
 *   CRYPTO_HTTP_SMOKE=1          — same as local convenience
 *   CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY — BscScan proxy eth_blockNumber (mainnet API by default)
 *
 * Optional:
 *   CRYPTO_HTTP_SMOKE_BSCSCAN_NETWORK=chapel — use api-testnet.bscscan.com
 *   CRYPTO_HTTP_SMOKE_RUGCHECK_MINT — override default wrapped-SOL mint for Rugcheck GET
 *   CRYPTO_HTTP_SMOKE_JUPITER_API_KEY — x-api-key header for Jupiter quote-api (same as extension storage)
 *   CRYPTO_HTTP_SMOKE_JUPITER_INPUT_MINT / OUTPUT_MINT / AMOUNT_RAW / SLIPPAGE_BPS — quote params (defaults: SOL→USDC, 1e6 lamports, 50 bps)
 *
 * See docs/CRYPTO_CI_SMOKE.md
 */
import process from 'node:process';

const runPublic =
  (process.env.CRYPTO_HTTP_SMOKE_RUN || '').trim() !== '' ||
  process.env.CRYPTO_HTTP_SMOKE === '1';
const bscKey = (process.env.CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY || '').trim();
const bscNet = (process.env.CRYPTO_HTTP_SMOKE_BSCSCAN_NETWORK || 'mainnet').trim().toLowerCase();
const rugMint = (
  process.env.CRYPTO_HTTP_SMOKE_RUGCHECK_MINT || 'So11111111111111111111111111111111111111112'
).trim();

const jupKey = (process.env.CRYPTO_HTTP_SMOKE_JUPITER_API_KEY || '').trim();
const jupInput =
  (process.env.CRYPTO_HTTP_SMOKE_JUPITER_INPUT_MINT || 'So11111111111111111111111111111111111111112').trim();
const jupOutput =
  (process.env.CRYPTO_HTTP_SMOKE_JUPITER_OUTPUT_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').trim();
const jupAmount = (process.env.CRYPTO_HTTP_SMOKE_JUPITER_AMOUNT_RAW || '1000000').trim();
const jupSlippage = Math.min(10000, Math.max(0, parseInt(process.env.CRYPTO_HTTP_SMOKE_JUPITER_SLIPPAGE_BPS || '50', 10) || 50));

const TIMEOUT_MS = 45_000;

async function fetchJson(url, label) {
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: non-JSON body ${text.slice(0, 200)}`);
  }
}

async function checkRugcheck() {
  const url = `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(rugMint)}/report`;
  const j = await fetchJson(url, 'Rugcheck');
  if (j == null || typeof j !== 'object') {
    throw new Error(`Rugcheck: unexpected payload ${JSON.stringify(j)}`);
  }
  console.log('[crypto-http-smoke] Rugcheck report ok (mint', rugMint.slice(0, 8) + '…)');
}

async function checkJupiterQuote() {
  const u = new URL('https://quote-api.jup.ag/v6/quote');
  u.searchParams.set('inputMint', jupInput);
  u.searchParams.set('outputMint', jupOutput);
  u.searchParams.set('amount', jupAmount);
  u.searchParams.set('slippageBps', String(jupSlippage));

  const headers = { accept: 'application/json' };
  if (jupKey) headers['x-api-key'] = jupKey;

  let res;
  try {
    res = await fetch(u.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
    });
  } catch (e) {
    throw new Error(`Jupiter quote: fetch failed (${e.message || e})`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jupiter quote: HTTP ${res.status} ${text.slice(0, 240)}`);
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Jupiter quote: non-JSON ${text.slice(0, 200)}`);
  }
  if (j == null || typeof j !== 'object') {
    throw new Error(`Jupiter quote: unexpected ${JSON.stringify(j)}`);
  }
  if (j.error != null && j.error !== '') {
    throw new Error(`Jupiter quote: API error ${JSON.stringify(j.error)}`);
  }
  const hasRoute = Array.isArray(j.routePlan) && j.routePlan.length > 0;
  const hasAmounts =
    typeof j.inAmount === 'string' &&
    typeof j.outAmount === 'string' &&
    j.inAmount.length > 0 &&
    j.outAmount.length > 0;
  if (!hasRoute && !hasAmounts) {
    throw new Error(`Jupiter quote: missing routePlan/inAmount/outAmount ${text.slice(0, 200)}`);
  }
  console.log('[crypto-http-smoke] Jupiter v6 quote ok (', jupInput.slice(0, 4) + '… → ' + jupOutput.slice(0, 4) + '…)');
}

async function checkAster() {
  const pingF = await fetch('https://fapi.asterdex.com/fapi/v1/ping', {
    method: 'GET',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!pingF.ok) {
    const t = await pingF.text();
    throw new Error(`Aster fapi ping: HTTP ${pingF.status} ${t.slice(0, 200)}`);
  }
  console.log('[crypto-http-smoke] Aster fapi /fapi/v1/ping: ok');

  const timeJ = await fetchJson('https://fapi.asterdex.com/fapi/v1/time', 'Aster fapi time');
  const st = timeJ && timeJ.serverTime;
  if (typeof st !== 'number' || !Number.isFinite(st) || st <= 0) {
    throw new Error(`Aster fapi time: unexpected ${JSON.stringify(timeJ)}`);
  }
  console.log('[crypto-http-smoke] Aster fapi /fapi/v1/time serverTime:', st);

  const pingS = await fetch('https://sapi.asterdex.com/api/v3/ping', {
    method: 'GET',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!pingS.ok) {
    const t = await pingS.text();
    throw new Error(`Aster sapi ping: HTTP ${pingS.status} ${t.slice(0, 200)}`);
  }
  console.log('[crypto-http-smoke] Aster sapi /api/v3/ping: ok');
}

async function checkBscScan(apiKey) {
  const base =
    bscNet === 'chapel' || bscNet === 'testnet' || bscNet === '97'
      ? 'https://api-testnet.bscscan.com/api'
      : 'https://api.bscscan.com/api';
  const u = new URL(base);
  u.searchParams.set('module', 'proxy');
  u.searchParams.set('action', 'eth_blockNumber');
  u.searchParams.set('apikey', apiKey);
  const j = await fetchJson(u.toString(), 'BscScan eth_blockNumber');
  const status = j && j.status;
  const result = j && j.result;
  if (String(status) !== '1' || typeof result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(result)) {
    throw new Error(`BscScan: unexpected ${JSON.stringify(j)}`);
  }
  console.log('[crypto-http-smoke] BscScan proxy eth_blockNumber:', result, '(' + base + ')');
}

async function main() {
  if (!runPublic && !bscKey) {
    console.log(
      '[crypto-http-smoke] skip: set CRYPTO_HTTP_SMOKE_RUN or CRYPTO_HTTP_SMOKE=1 and/or CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY'
    );
    process.exit(0);
  }
  if (runPublic) {
    await checkRugcheck();
    await checkAster();
    await checkJupiterQuote();
  }
  if (bscKey) await checkBscScan(bscKey);
}

main().catch((e) => {
  console.error('[crypto-http-smoke]', e.message || e);
  process.exit(1);
});
