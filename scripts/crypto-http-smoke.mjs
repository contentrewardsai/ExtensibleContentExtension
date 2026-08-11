#!/usr/bin/env node
/**
 * Optional read-only HTTP smoke for third-party APIs used by Pulse / crypto paths.
 * Exits 0 with a skip message when nothing is enabled (no accidental CI network by default).
 *
 * Enable (any of):
 *   CRYPTO_HTTP_SMOKE_RUN        — non-empty (e.g. CI secret "1") → Rugcheck + Aster + Jupiter quote
 *   CRYPTO_HTTP_SMOKE=1          — same as local convenience
 *   CRYPTO_HTTP_SMOKE_BSCSCAN_API_KEY — Etherscan Multichain V2 key; proxy eth_blockNumber (BSC 56 by default)
 *
 * Optional:
 *   CRYPTO_HTTP_SMOKE_BSCSCAN_NETWORK=chapel — use chainid=97 (Chapel) instead of 56
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
  const headers = { accept: 'application/json' };
  if (jupKey) headers['x-api-key'] = jupKey;

  const bases = ['https://quote-api.jup.ag/v6/quote', 'https://lite-api.jup.ag/swap/v1/quote'];
  let lastErr = '';
  let j = null;
  let usedBase = bases[0];

  for (let i = 0; i < bases.length; i++) {
    const u = new URL(bases[i]);
    u.searchParams.set('inputMint', jupInput);
    u.searchParams.set('outputMint', jupOutput);
    u.searchParams.set('amount', jupAmount);
    u.searchParams.set('slippageBps', String(jupSlippage));
    usedBase = bases[i];
    let res;
    try {
      res = await fetch(u.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers,
      });
    } catch (e) {
      lastErr = `fetch failed (${e.message || e})`;
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      lastErr = `HTTP ${res.status} ${text.slice(0, 240)}`;
      continue;
    }
    try {
      j = JSON.parse(text);
    } catch {
      lastErr = `non-JSON ${text.slice(0, 200)}`;
      continue;
    }
    if (j == null || typeof j !== 'object') {
      lastErr = `unexpected ${JSON.stringify(j)}`;
      j = null;
      continue;
    }
    if (j.error != null && j.error !== '') {
      lastErr = `API error ${JSON.stringify(j.error)}`;
      j = null;
      continue;
    }
    const hasRoute = Array.isArray(j.routePlan) && j.routePlan.length > 0;
    const hasAmounts =
      typeof j.inAmount === 'string' &&
      typeof j.outAmount === 'string' &&
      j.inAmount.length > 0 &&
      j.outAmount.length > 0;
    if (!hasRoute && !hasAmounts) {
      lastErr = `missing routePlan/inAmount/outAmount ${text.slice(0, 200)}`;
      j = null;
      continue;
    }
    break;
  }

  if (!j) {
    throw new Error(`Jupiter quote: ${lastErr || 'all endpoints failed'}`);
  }
  const host = usedBase.includes('lite-api') ? 'lite-api' : 'quote-api';
  console.log(
    '[crypto-http-smoke] Jupiter quote ok via',
    host,
    '(',
    jupInput.slice(0, 4) + '… → ' + jupOutput.slice(0, 4) + '…)',
  );
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
  const chainId =
    bscNet === 'chapel' || bscNet === 'testnet' || bscNet === '97' ? '97' : '56';
  const u = new URL('https://api.etherscan.io/v2/api');
  u.searchParams.set('chainid', chainId);
  u.searchParams.set('module', 'proxy');
  u.searchParams.set('action', 'eth_blockNumber');
  u.searchParams.set('apikey', apiKey);
  const j = await fetchJson(u.toString(), 'Etherscan V2 eth_blockNumber');
  const result = j && j.result;
  const status = j && j.status;
  if (String(status) === '0') {
    const detail =
      (typeof result === 'string' && result) || j.message || JSON.stringify(j);
    // Free Multichain keys often accept Ethereum only — treat as soft skip, not hard fail.
    if (
      /Free API access is not supported for this chain/i.test(detail) ||
      /upgrade your api plan for full chain coverage/i.test(detail)
    ) {
      console.log(
        '[crypto-http-smoke] skip Etherscan V2 BSC: key accepted but plan lacks chainid=' +
          chainId +
          ' coverage —',
        String(detail).slice(0, 160),
      );
      return;
    }
    throw new Error(`Etherscan V2 (chainid=${chainId}): ${detail}`);
  }
  const okClassic = String(status) === '1' && typeof result === 'string' && /^0x[0-9a-fA-F]+$/.test(result);
  const okJsonRpc =
    j &&
    j.jsonrpc &&
    typeof result === 'string' &&
    /^0x[0-9a-fA-F]+$/.test(result);
  if (!okClassic && !okJsonRpc) {
    throw new Error(`Etherscan V2: unexpected ${JSON.stringify(j)}`);
  }
  console.log(
    '[crypto-http-smoke] Etherscan V2 proxy eth_blockNumber:',
    result,
    `(chainid=${chainId})`,
  );
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
