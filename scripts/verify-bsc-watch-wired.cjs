#!/usr/bin/env node
/**
 * Guard: BSC Following watch must be loaded and alarm-wired in the service worker.
 * Run: node scripts/verify-bsc-watch-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const modPath = path.join(root, 'background', 'bsc-watch.js');
const providersPath = path.join(root, 'shared', 'bsc-indexer-providers.js');
const transportsPath = path.join(root, 'background', 'bsc-indexer-transports.js');

for (const p of [swPath, modPath, providersPath, transportsPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-bsc-watch-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const checks = [
  ["importScripts('fetch-resilient.js') before bsc-watch", "importScripts('fetch-resilient.js')"],
  ["importScripts bsc-indexer-providers", "importScripts('../shared/bsc-indexer-providers.js')"],
  ["importScripts bsc-indexer-transports", "importScripts('bsc-indexer-transports.js')"],
  ["importScripts('bsc-watch.js')", "importScripts('bsc-watch.js')"],
  ['alarm cfs_bsc_watch_poll', "alarm.name === 'cfs_bsc_watch_poll'"],
  ['__CFS_bscWatch_tick in alarm branch', '__CFS_bscWatch_tick'],
  ['CFS_BSC_WATCH_GET_ACTIVITY handler', "type === 'CFS_BSC_WATCH_GET_ACTIVITY'"],
  ['CFS_BSC_INDEXER_STATUS handler', "type === 'CFS_BSC_INDEXER_STATUS'"],
  ['CFS_BSC_WATCH_TEST_HOOK handler', "type === 'CFS_BSC_WATCH_TEST_HOOK'"],
];

for (const [label, needle] of checks) {
  if (!sw.includes(needle)) {
    console.error('verify-bsc-watch-wired: service-worker.js missing:', label);
    process.exit(1);
  }
}

const setupMatches = sw.match(/__CFS_bscWatch_setupAlarm/g);
if (!setupMatches || setupMatches.length < 2) {
  console.error(
    'verify-bsc-watch-wired: __CFS_bscWatch_setupAlarm should run on install and startup (expected ≥2 references)',
  );
  process.exit(1);
}

for (const t of [
  'CFS_BSC_WATCH_REFRESH_NOW',
  'CFS_BSC_WATCH_CLEAR_ACTIVITY',
  'CFS_BSC_INDEXER_STATUS',
  'CFS_BSC_WATCH_TEST_HOOK',
]) {
  if (!sw.includes(t)) {
    console.error('verify-bsc-watch-wired: service-worker.js missing message type:', t);
    process.exit(1);
  }
}

const bw = fs.readFileSync(modPath, 'utf8');
if (!bw.includes('cfsBscWatchTokenCursors')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js missing tokentx cursor key');
  process.exit(1);
}
if (!bw.includes('prefetchBscBlockNumbers') || !bw.includes('blockByNetwork')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js missing per-tick block prefetch');
  process.exit(1);
}
if (!bw.includes('sleepBscScanPaceBetweenAddresses') || !bw.includes('BSCSCAN_INTER_ADDRESS_MIN_MS')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js missing inter-address indexer pacing');
  process.exit(1);
}
if (!bw.includes('sleepBscScanPaceTxlistToTokentx') || !bw.includes('BSCSCAN_TXLIST_TO_TOKENTX_MIN_MS')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js missing native→token pacing');
  process.exit(1);
}
if (!bw.includes('__CFS_createBscIndexerTransport') || !bw.includes('resolveProviderFailoverOrder')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js must use multi-provider failover transports');
  process.exit(1);
}
if (!bw.includes('__CFS_bscWatch_testHook') || !bw.includes('BSC_WATCH_MAX_SPAN_BLOCKS')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js must expose test hook + max span constant');
  process.exit(1);
}
if (!bw.includes('no_bsc_indexer_key') || !bw.includes('etherscan_plan_no_bsc')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js must map missing indexer / plan gaps');
  process.exit(1);
}
if (!bw.includes('quickNodeMinPollMinutes') && !bw.includes('cfs_bsc_quicknode_aggressive_poll')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js must pace QuickNode poll interval');
  process.exit(1);
}

const tr = fs.readFileSync(transportsPath, 'utf8');
if (!tr.includes('api.etherscan.io/v2/api') || !tr.includes('chainid=')) {
  console.error('verify-bsc-watch-wired: transports must use Etherscan Multichain API V2 (chainid)');
  process.exit(1);
}
if (!tr.includes('qn_getTransactionsByAddress') || !tr.includes('__CFS_fetchGetTiered')) {
  console.error('verify-bsc-watch-wired: transports must support QuickNode + tiered fetch');
  process.exit(1);
}
if (!tr.includes('rpc.ankr.com') || !tr.includes('api.covalenthq.com')) {
  console.error('verify-bsc-watch-wired: transports must include Ankr and Covalent');
  process.exit(1);
}

const prov = fs.readFileSync(providersPath, 'utf8');
if (!prov.includes('CFS_BSC_INDEXER') || !prov.includes('estimateQuickNodeMonthlyCredits')) {
  console.error('verify-bsc-watch-wired: providers catalog incomplete');
  process.exit(1);
}

console.log('verify-bsc-watch-wired: OK');
process.exit(0);
