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

for (const p of [swPath, modPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-bsc-watch-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const checks = [
  ["importScripts('fetch-resilient.js') before bsc-watch", "importScripts('fetch-resilient.js')"],
  ["importScripts('bsc-watch.js')", "importScripts('bsc-watch.js')"],
  ['alarm cfs_bsc_watch_poll', "alarm.name === 'cfs_bsc_watch_poll'"],
  ['__CFS_bscWatch_tick in alarm branch', '__CFS_bscWatch_tick'],
  ['CFS_BSC_WATCH_GET_ACTIVITY handler', "type === 'CFS_BSC_WATCH_GET_ACTIVITY'"],
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

for (const t of ['CFS_BSC_WATCH_REFRESH_NOW', 'CFS_BSC_WATCH_CLEAR_ACTIVITY']) {
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
  console.error('verify-bsc-watch-wired: bsc-watch.js missing inter-address BscScan pacing');
  process.exit(1);
}
if (!bw.includes('sleepBscScanPaceTxlistToTokentx') || !bw.includes('BSCSCAN_TXLIST_TO_TOKENTX_MIN_MS')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js missing txlist→tokentx BscScan pacing');
  process.exit(1);
}
if (!bw.includes('bscWatchFetchGet') || !bw.includes('__CFS_fetchGetTiered')) {
  console.error('verify-bsc-watch-wired: bsc-watch.js must use __CFS_fetchGetTiered for indexer GETs');
  process.exit(1);
}

console.log('verify-bsc-watch-wired: OK');
process.exit(0);
