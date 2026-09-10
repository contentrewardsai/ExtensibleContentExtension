#!/usr/bin/env node
/**
 * Guard: Following automation evaluator must load before watch modules; SW must handle status message.
 * Run: node scripts/verify-cfs-always-on-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const sharedPath = path.join(root, 'shared', 'cfs-always-on-automation.js');

for (const p of [swPath, sharedPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-cfs-always-on-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const solIdx = sw.indexOf("importScripts('solana-watch.js')");
const aoIdx = sw.indexOf("importScripts('../shared/cfs-always-on-automation.js')");
const feedsIdx = sw.indexOf("importScripts('../shared/realtime-feeds.js')");
if (solIdx < 0 || aoIdx < 0 || aoIdx >= solIdx) {
  console.error(
    'verify-cfs-always-on-wired: service-worker.js must import cfs-always-on-automation.js before solana-watch.js',
  );
  process.exit(1);
}
if (feedsIdx < 0 || feedsIdx < aoIdx) {
  console.error(
    'verify-cfs-always-on-wired: service-worker.js must import realtime-feeds.js after cfs-always-on-automation.js',
  );
  process.exit(1);
}

const hasStatus =
  sw.includes("type === 'CFS_FOLLOWING_AUTOMATION_STATUS'") ||
  sw.includes("case 'CFS_FOLLOWING_AUTOMATION_STATUS'") ||
  sw.includes('CFS_FOLLOWING_AUTOMATION_STATUS');
if (!hasStatus) {
  console.error('verify-cfs-always-on-wired: service-worker.js missing CFS_FOLLOWING_AUTOMATION_STATUS handler');
  process.exit(1);
}

const customIdx = sw.indexOf("importScripts('custom-realtime-poll.js')");
const clmmIdx = sw.indexOf("importScripts('raydium-clmm-range-watch.js')");
const dlmmIdx = sw.indexOf("importScripts('meteora-dlmm-range-watch.js')");
if (customIdx < 0 || customIdx < aoIdx || clmmIdx < 0 || clmmIdx < aoIdx || dlmmIdx < 0 || dlmmIdx < aoIdx) {
  console.error(
    'verify-cfs-always-on-wired: service-worker.js must import custom/clmm/dlmm pollers after cfs-always-on-automation.js',
  );
  process.exit(1);
}

const sh = fs.readFileSync(sharedPath, 'utf8');
if (!sh.includes('__CFS_evaluateFollowingAutomation')) {
  console.error('verify-cfs-always-on-wired: shared file must export __CFS_evaluateFollowingAutomation');
  process.exit(1);
}

console.log('verify-cfs-always-on-wired: OK');
process.exit(0);
