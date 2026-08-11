#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
const bsc = fs.readFileSync(path.join(root, 'background/bsc-evm.js'), 'utf8');
const watch = fs.readFileSync(path.join(root, 'background/infi-bin-range-watch.js'), 'utf8');
const steps = fs.readFileSync(path.join(root, 'steps/manifest.json'), 'utf8');
const ids = fs.readFileSync(path.join(root, 'shared/crypto-workflow-step-ids.js'), 'utf8');

const checks = [
  [bsc, '__CFS_bsc_infi_bin_range_check', 'bsc-evm: infi bin range check handler'],
  [sw, 'CFS_BSC_INFI_BIN_RANGE_CHECK', 'service-worker: validation + route'],
  [sw, 'infi-bin-range-watch.js', 'service-worker: import infi-bin-range-watch'],
  [sw, 'cfs_infi_bin_range_poll', 'service-worker: alarm name'],
  [sw, '__CFS_executeBackgroundWorkflow', 'service-worker: background workflow export'],
  [watch, '__CFS_infiBinRangeWatch_tick', 'infi-bin-range-watch: tick'],
  [watch, 'onOutOfRange', 'infi-bin-range-watch: trigger rules'],
  [watch, 'no_infi_positions', 'infi-bin-range-watch: idle when empty'],
  [watch, 'activeWatchPositions', 'infi-bin-range-watch: multi-position'],
  [watch, 'boundRows', 'infi-bin-range-watch: boundRows comments/usage'],
  [steps, 'pancakeInfiBinRangeWatch', 'steps manifest'],
  [ids, 'pancakeInfiBinRangeWatch', 'crypto step ids'],
];

let failed = 0;
for (const [file, needle, label] of checks) {
  if (!file.includes(needle)) {
    console.error('FAIL:', label);
    failed++;
  } else {
    console.log('OK:', label);
  }
}

if (failed) process.exit(1);
console.log('All BSC Infinity range watch wiring checks passed.');
