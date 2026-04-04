#!/usr/bin/env node
/**
 * Guard: BSC Following automation venues (V3 / farm / aggregator / Infinity) stay wired to bsc-evm pins.
 * Run: node scripts/verify-bsc-following-venues-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const watchPath = path.join(root, 'background', 'bsc-watch.js');
const evmPath = path.join(root, 'background', 'bsc-evm.js');
const driftPath = path.join(root, 'background', 'watch-activity-price-filter.js');

const PREFIX = 'verify-bsc-following-venues-wired';

for (const p of [watchPath, evmPath, driftPath]) {
  if (!fs.existsSync(p)) {
    console.error(`${PREFIX}: missing`, path.relative(root, p));
    process.exit(1);
  }
}

const evm = fs.readFileSync(evmPath, 'utf8');
if (!evm.includes('PANCAKE_SWAP_ROUTER_V3:') || !evm.includes('includeLogs')) {
  console.error(`${PREFIX}: bsc-evm.js missing V3 constant export or receipt includeLogs`);
  process.exit(1);
}

const bw = fs.readFileSync(watchPath, 'utf8');
const needles = [
  'classifyOutgoingBscTx',
  'classifyV3RouterTx',
  'fetchReceiptAndEnrichClassification',
  'ensureAllowanceV3ThenSwap',
  'ensureAggregatorParaswapAutomation',
  'ensureFarmFollowingAutomationExecution',
  'resolveParaswapUserAddress',
  'farm_like',
  'PARASWAP_BSC_EXECUTORS',
];
for (const n of needles) {
  if (!bw.includes(n)) {
    console.error(`${PREFIX}: bsc-watch.js missing:`, n);
    process.exit(1);
  }
}

const drift = fs.readFileSync(driftPath, 'utf8');
if (!drift.includes("venueB === 'v3'") || !drift.includes("venueB === 'aggregator'")) {
  console.error(`${PREFIX}: watch-activity-price-filter.js missing venue drift branches`);
  process.exit(1);
}

const apiPath = path.join(root, 'docs', 'PROGRAMMATIC_API.md');
const bscStepReadme = path.join(root, 'steps', 'bscWatchReadActivity', 'README.md');
const solStepReadme = path.join(root, 'steps', 'solanaWatchReadActivity', 'README.md');
for (const p of [apiPath, bscStepReadme, solStepReadme]) {
  if (!fs.existsSync(p)) {
    console.error(`${PREFIX}: missing`, path.relative(root, p));
    process.exit(1);
  }
}
const apiMd = fs.readFileSync(apiPath, 'utf8');
if (!apiMd.includes('id="cfs-watch-get-activity"')) {
  console.error(`${PREFIX}: PROGRAMMATIC_API.md missing stable #cfs-watch-get-activity anchor`);
  process.exit(1);
}
const anchorFrag = 'PROGRAMMATIC_API.md#cfs-watch-get-activity';
for (const [rel, txt] of [
  [path.relative(root, bscStepReadme), fs.readFileSync(bscStepReadme, 'utf8')],
  [path.relative(root, solStepReadme), fs.readFileSync(solStepReadme, 'utf8')],
]) {
  if (!txt.includes(anchorFrag)) {
    console.error(`${PREFIX}:`, rel, 'must link to', anchorFrag);
    process.exit(1);
  }
}

console.log(`${PREFIX}: OK`);
process.exit(0);
