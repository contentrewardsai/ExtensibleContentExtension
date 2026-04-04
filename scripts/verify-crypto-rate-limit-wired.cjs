#!/usr/bin/env node
/**
 * Guard: rate-limit + gate helpers wired in service worker and shared modules.
 * Run: node scripts/verify-crypto-rate-limit-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const frPath = path.join(root, 'background', 'fetch-resilient.js');
const cwPath = path.join(root, 'shared', 'crypto-workflow-step-ids.js');
const cfsPath = path.join(root, 'shared', 'cfs-always-on-automation.js');
const swSol = path.join(root, 'background', 'solana-swap.js');
const swWatch = path.join(root, 'background', 'solana-watch.js');
const bscEvm = path.join(root, 'background', 'bsc-evm.js');
const pumpProbe = path.join(root, 'background', 'pump-market-probe.js');
const wafPath = path.join(root, 'background', 'watch-activity-price-filter.js');
const cprPath = path.join(root, 'background', 'following-automation-runner.js');
const perpsPath = path.join(root, 'background', 'perps-status.js');
const smbPath = path.join(root, 'shared', 'solana-jsonrpc-mint-batch.js');

for (const p of [swPath, frPath, smbPath, cwPath, cfsPath, swSol, swWatch, bscEvm, pumpProbe, wafPath, cprPath, perpsPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-crypto-rate-limit-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const idxFr = sw.indexOf("importScripts('fetch-resilient.js')");
const idxSmb = sw.indexOf("importScripts('../shared/solana-jsonrpc-mint-batch.js')");
const idxCw = sw.indexOf("importScripts('../shared/crypto-workflow-step-ids.js')");
const idxCfs = sw.indexOf("importScripts('../shared/cfs-always-on-automation.js')");
const idxWaf = sw.indexOf("importScripts('watch-activity-price-filter.js')");
if (
  idxFr < 0 ||
  idxSmb < 0 ||
  idxCw < 0 ||
  idxCfs < 0 ||
  idxWaf < 0 ||
  !(idxFr < idxSmb && idxSmb < idxCw && idxCw < idxCfs && idxFr < idxWaf)
) {
  console.error(
    'verify-crypto-rate-limit-wired: service-worker.js must import fetch-resilient, then solana-jsonrpc-mint-batch, then crypto-workflow-step-ids, cfs-always-on-automation; watch-activity after fetch-resilient',
  );
  process.exit(1);
}

const fr = fs.readFileSync(frPath, 'utf8');
if (
  !fr.includes('__CFS_fetchWith429Backoff') ||
  !fr.includes('__CFS_fetchGetResilient') ||
  !fr.includes('__CFS_fetchGetTiered')
) {
  console.error('verify-crypto-rate-limit-wired: fetch-resilient.js missing globals');
  process.exit(1);
}

const smb = fs.readFileSync(smbPath, 'utf8');
if (!smb.includes('__CFS_fetchTwoMintDecimalsSolanaRpc') || !smb.includes('__CFS_solanaRpcJsonBatchCall')) {
  console.error('verify-crypto-rate-limit-wired: solana-jsonrpc-mint-batch.js missing batch exports');
  process.exit(1);
}

const cw = fs.readFileSync(cwPath, 'utf8');
if (!cw.includes('__CFS_libraryNeedsCryptoOrPulseWatch')) {
  console.error('verify-crypto-rate-limit-wired: crypto-workflow-step-ids.js missing library gate');
  process.exit(1);
}

const cfs = fs.readFileSync(cfsPath, 'utf8');
if (!cfs.includes('__CFS_libraryNeedsCryptoOrPulseWatch') || !cfs.includes('needCrypto')) {
  console.error('verify-crypto-rate-limit-wired: cfs-always-on-automation.js missing step-aware legacy gate');
  process.exit(1);
}

const solSwap = fs.readFileSync(swSol, 'utf8');
if (!solSwap.includes('jupiterFetch') || !solSwap.includes('jupiterCrossCheckMaxDeviationBps')) {
  console.error('verify-crypto-rate-limit-wired: solana-swap.js missing Jupiter resilient fetch / cross-check');
  process.exit(1);
}
const jupFetchIdx = solSwap.indexOf('async function jupiterFetch');
if (jupFetchIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: solana-swap.js missing jupiterFetch');
  process.exit(1);
}
const jupFetchSlice = solSwap.slice(jupFetchIdx, jupFetchIdx + 700);
if (!jupFetchSlice.includes('__CFS_fetchGetTiered') || !jupFetchSlice.includes('__CFS_fetchWith429Backoff')) {
  console.error(
    'verify-crypto-rate-limit-wired: solana-swap.js jupiterFetch must use tiered GET and 429 backoff for POST',
  );
  process.exit(1);
}
const uriIdx = solSwap.indexOf('async function fetchHttpsTextLimited');
if (uriIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: solana-swap.js missing fetchHttpsTextLimited');
  process.exit(1);
}
const uriSlice = solSwap.slice(uriIdx, uriIdx + 1600);
if (
  !uriSlice.includes('__CFS_fetchGetTiered') ||
  !uriSlice.includes('__CFS_fetchWith429Backoff')
) {
  console.error(
    'verify-crypto-rate-limit-wired: solana-swap.js Metaplex URI fetch must use tiered GET with 429 fallback',
  );
  process.exit(1);
}

const solW = fs.readFileSync(swWatch, 'utf8');
if (!solW.includes('__CFS_fetchGetTiered')) {
  console.error('verify-crypto-rate-limit-wired: solana-watch.js should use tiered Jupiter price GET');
  process.exit(1);
}
if (!solW.includes('cfs_quicknode_solana_http_url') || !solW.includes('cfs_solana_watch_high_reliability')) {
  console.error('verify-crypto-rate-limit-wired: solana-watch.js missing QuickNode / high-reliability keys');
  process.exit(1);
}
if (!solW.includes('maxAttempts') || !solW.includes('_cfsHttpStatus')) {
  console.error('verify-crypto-rate-limit-wired: solana-watch.js missing expanded RPC retry');
  process.exit(1);
}
if (!solW.includes('rpcBatchGetTransactions') || !solW.includes('jupPriceCacheGet')) {
  console.error(
    'verify-crypto-rate-limit-wired: solana-watch.js missing batched getTransaction or Jupiter price cache',
  );
  process.exit(1);
}
const batchTxIdx = solW.indexOf('function rpcBatchGetTransactions');
if (batchTxIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: solana-watch.js missing rpcBatchGetTransactions');
  process.exit(1);
}
const batchTxSlice = solW.slice(batchTxIdx, batchTxIdx + 800);
if (!batchTxSlice.includes('__CFS_solanaRpcJsonBatchCall')) {
  console.error('verify-crypto-rate-limit-wired: solana-watch.js must use shared JSON-RPC batch helper');
  process.exit(1);
}
if (!solW.includes('sleepSolanaWatchPaceBetweenAddresses') || !solW.includes('SOLANA_WATCH_INTER_ADDRESS_MIN_MS')) {
  console.error('verify-crypto-rate-limit-wired: solana-watch.js missing inter-address HTTP poll pacing');
  process.exit(1);
}

const bsc = fs.readFileSync(bscEvm, 'utf8');
const cfsRfIdx = bsc.indexOf('function cfsResilientFetch');
if (cfsRfIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: bsc-evm.js missing cfsResilientFetch helper');
  process.exit(1);
}
const cfsRfSlice = bsc.slice(cfsRfIdx, cfsRfIdx + 750);
if (!cfsRfSlice.includes('__CFS_fetchGetTiered') || !cfsRfSlice.includes('__CFS_fetchWith429Backoff')) {
  console.error(
    'verify-crypto-rate-limit-wired: bsc-evm.js cfsResilientFetch must tier GET and use 429 backoff for mutating methods',
  );
  process.exit(1);
}
const paraIdx = bsc.indexOf("op === 'paraswapSwap'");
if (paraIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: bsc-evm.js missing paraswapSwap handler');
  process.exit(1);
}
const paraBlock = bsc.slice(paraIdx, paraIdx + 10000);
if ((paraBlock.match(/cfsResilientFetch/g) || []).length < 2) {
  console.error('verify-crypto-rate-limit-wired: bsc-evm.js paraswapSwap must use cfsResilientFetch for price + tx');
  process.exit(1);
}
const farmIdx = bsc.indexOf("op === 'infiFarmClaim'");
if (farmIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: bsc-evm.js missing infiFarmClaim handler');
  process.exit(1);
}
const farmBlock = bsc.slice(farmIdx, farmIdx + 900);
if (!farmBlock.includes('cfsResilientFetch(urlFc)')) {
  console.error('verify-crypto-rate-limit-wired: bsc-evm.js infiFarmClaim must use cfsResilientFetch for Pancake Infinity API');
  process.exit(1);
}

const probe = fs.readFileSync(pumpProbe, 'utf8');
const rayIdx = probe.indexOf('function raydiumResilientFetch');
if (rayIdx < 0) {
  console.error('verify-crypto-rate-limit-wired: pump-market-probe.js missing raydiumResilientFetch');
  process.exit(1);
}
const raySlice = probe.slice(rayIdx, rayIdx + 500);
if (!raySlice.includes('__CFS_fetchGetTiered') || !raySlice.includes('__CFS_fetchWith429Backoff')) {
  console.error('verify-crypto-rate-limit-wired: pump-market-probe Raydium GET must use tiered fetch + 429 fallback');
  process.exit(1);
}

const waf = fs.readFileSync(wafPath, 'utf8');
if (!waf.includes('__CFS_fetchWith429Backoff') || !waf.includes('__CFS_fetchGetTiered')) {
  console.error(
    'verify-crypto-rate-limit-wired: watch-activity-price-filter.js must use tiered Jupiter/Paraswap GET + 429 backoff RPC',
  );
  process.exit(1);
}
if (!waf.includes('WATCH_QUICKNODE_HTTP') || !waf.includes('cfs_quicknode_solana_http_url')) {
  console.error(
    'verify-crypto-rate-limit-wired: watch-activity-price-filter.js must resolve QuickNode watch RPC like solana-watch',
  );
  process.exit(1);
}
if (!waf.includes('__CFS_fetchTwoMintDecimalsSolanaRpc')) {
  console.error(
    'verify-crypto-rate-limit-wired: watch-activity-price-filter.js must use shared two-mint decimals batch',
  );
  process.exit(1);
}

const cpr = fs.readFileSync(cprPath, 'utf8');
if (!cpr.includes('__CFS_fetchGetTiered') || !cpr.includes('fetchRugcheckReport')) {
  console.error('verify-crypto-rate-limit-wired: following-automation-runner.js must use tiered Rugcheck HTTP');
  process.exit(1);
}
if (!cpr.includes('__CFS_fetch_rugcheck_report')) {
  console.error('verify-crypto-rate-limit-wired: following-automation-runner.js must export __CFS_fetch_rugcheck_report for SW + steps');
  process.exit(1);
}
if (!sw.includes('CFS_RUGCHECK_TOKEN_REPORT')) {
  console.error('verify-crypto-rate-limit-wired: service-worker.js missing CFS_RUGCHECK_TOKEN_REPORT handler');
  process.exit(1);
}

const perps = fs.readFileSync(perpsPath, 'utf8');
if (!perps.includes('__CFS_fetchGetTiered') || !perps.includes('JUPITER_PERPS_MARKETS_URL')) {
  console.error('verify-crypto-rate-limit-wired: perps-status.js must use tiered GET for Jupiter perps markets');
  process.exit(1);
}

console.log('verify-crypto-rate-limit-wired: OK');
process.exit(0);
