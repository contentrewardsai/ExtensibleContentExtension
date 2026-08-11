#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
const bsc = fs.readFileSync(path.join(root, 'background/bsc-evm.js'), 'utf8');
const watch = fs.readFileSync(path.join(root, 'background/v3-range-watch.js'), 'utf8');
const infi = fs.readFileSync(path.join(root, 'background/infi-bin-range-watch.js'), 'utf8');
const steps = fs.readFileSync(path.join(root, 'steps/manifest.json'), 'utf8');
const ids = fs.readFileSync(path.join(root, 'shared/crypto-workflow-step-ids.js'), 'utf8');
const lp = fs.readFileSync(path.join(root, 'shared/pancake-v3-lp-amounts.js'), 'utf8');
const ticks = fs.readFileSync(path.join(root, 'shared/pancake-v3-price-ticks.js'), 'utf8');
const bound = fs.readFileSync(path.join(root, 'shared/always-on-bound-positions.js'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs/BSC_V3_LP_WORKFLOWS.md'), 'utf8');
const wf = fs.readFileSync(path.join(root, 'workflows/bsc-v3-lp/workflow.json'), 'utf8');
const settingsHtml = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
const unitHtml = fs.readFileSync(path.join(root, 'test/unit-tests.html'), 'utf8');
const mcpWd = fs.readFileSync(path.join(root, 'mcp-server/watchdog.js'), 'utf8');
const mcpSys = fs.readFileSync(path.join(root, 'mcp-server/tools/system.js'), 'utf8');

const checks = [
  [bsc, '__CFS_bsc_v3_range_check', 'bsc-evm: V3 range check handler'],
  [bsc, '__CFS_bsc_v3_range_check_batch', 'bsc-evm: V3 batch range check'],
  [bsc, '__CFS_bsc_v3_npm_positions_by_owner', 'bsc-evm: NPM discover by owner'],
  [bsc, '__CFS_bsc_ensure_native_gas_from_stable', 'bsc-evm: gas top-up from stable'],
  [bsc, "op === 'v3RangeFromPercent'", 'bsc-evm: v3RangeFromPercent'],
  [bsc, "op === 'v3RestakeRange'", 'bsc-evm: v3RestakeRange'],
  [bsc, "op === 'v3LpAmountsFromBnb'", 'bsc-evm: v3LpAmountsFromBnb'],
  [bsc, "op === 'v3LpAmountsFromStable'", 'bsc-evm: v3LpAmountsFromStable'],
  [bsc, "op === 'ensureNativeGasFromStable'", 'bsc-evm: ensureNativeGasFromStable op'],
  [lp, 'amountsFromStableBudget', 'lp-amounts: amountsFromStableBudget'],
  [lp, 'rangePercentBelow', 'lp-amounts: asymmetric range'],
  [bound, 'normalizeBoundPositions', 'bound-positions: normalize'],
  [bound, 'upsertBoundPosition', 'bound-positions: upsert'],
  [bound, 'reconcilePositions', 'bound-positions: reconcile'],
  [steps, 'bscV3EnterFromStable', 'steps manifest: enter from stable'],
  [sw, 'pancake-v3-lp-amounts.js', 'service-worker: import pancake-v3-lp-amounts'],
  [sw, 'always-on-bound-positions.js', 'service-worker: import bound-positions'],
  [sw, 'v3-range-watch.js', 'service-worker: import v3-range-watch'],
  [sw, 'cfs_v3_range_poll', 'service-worker: V3 alarm name'],
  [sw, 'CFS_V3_RANGE_WATCH_GET_STATUS', 'service-worker: V3 watch status'],
  [sw, 'CFS_V3_RANGE_WATCH_REFRESH_NOW', 'service-worker: V3 watch refresh'],
  [sw, 'CFS_V3_RANGE_WATCH_STOP', 'service-worker: V3 watch stop'],
  [sw, 'CFS_V3_RECONCILE_POSITIONS', 'service-worker: V3 reconcile'],
  [watch, '__CFS_v3RangeWatch_tick', 'v3-range-watch: tick'],
  [watch, 'no_v3_positions', 'v3-range-watch: idle when empty'],
  [watch, 'activeWatchPositions', 'v3-range-watch: multi-position'],
  [watch, 'onOutOfRange', 'v3-range-watch: trigger rules'],
  [watch, '30000', 'v3-range-watch: 30s default'],
  [infi, 'no_infi_positions', 'infi watch: idle when empty'],
  [infi, 'activeWatchPositions', 'infi watch: multi-position'],
  [lp, 'CFS_PANCAKE_V3_LP', 'lp-amounts helper export'],
  [ticks, 'CFS_PANCAKE_V3', 'price-ticks helper export'],
  [settingsHtml, 'pancake-v3-price-ticks.js', 'settings.html: load price-ticks'],
  [settingsHtml, 'pancake-v3-lp-amounts.js', 'settings.html: load lp-amounts'],
  [settingsHtml, 'always-on-bound-positions.js', 'settings.html: load bound-positions'],
  [unitHtml, 'pancake-v3-price-ticks.js', 'unit-tests.html: load price-ticks'],
  [unitHtml, 'pancake-v3-lp-amounts.js', 'unit-tests.html: load lp-amounts'],
  [unitHtml, 'always-on-bound-positions.js', 'unit-tests.html: load bound-positions'],
  [steps, 'bscV3LpWizard', 'steps manifest: wizard'],
  [steps, 'bscV3AutoApprove', 'steps manifest: auto-approve'],
  [steps, 'bscV3RebalanceOnce', 'steps manifest: rebalance'],
  [ids, 'bscV3LpWizard', 'crypto step ids: wizard'],
  [docs, 'exitBelowPolicy', 'docs: exit policies'],
  [docs, 'boundRows', 'docs: multi-position boundRows'],
  [docs, 'bindAlwaysOnBoundRow', 'docs: boundRow handoff step'],
  [docs, 'Chapel', 'docs: testnet/Chapel section'],
  [docs, 'Always-on monitor path', 'docs: canary monitor path table'],
  [wf, 'wf-bsc-v3-monitor', 'workflow bundle: monitor'],
  [wf, 'exitAbovePolicy', 'workflow bundle: independent above policy'],
  [wf, '"rangePercent": "0.5"', 'workflow bundle: ±0.5% rangePercent'],
  [wf, '"exitBelowPolicy": "sell_stable"', 'workflow bundle: below→sell_stable'],
  [wf, '"exitAbovePolicy": "restake"', 'workflow bundle: above→restake'],
  [wf, 'bindAlwaysOnBoundRow', 'workflow bundle: handoff after mint'],
  [wf, '"bindMode": "upsert"', 'workflow bundle: upsert bind'],
  [wf, '"bindMode": "remove"', 'workflow bundle: remove bind'],
  [wf, 'ensureNativeGasFromStable', 'workflow bundle: gas top-up on exit'],
  [sw, 'CFS_ALWAYS_ON_MERGE_BOUND_ROW', 'service-worker: boundRow merge'],
  [steps, 'bindAlwaysOnBoundRow', 'steps manifest: bindAlwaysOnBoundRow'],
  [mcpWd, 'createWatchdog', 'mcp: watchdog module'],
  [mcpWd, 'directRpcWhenRelayDown', 'mcp: watchdog direct RPC config'],
  [mcpWd, 'directRpcCheckSnapshot', 'mcp: watchdog direct RPC check'],
  [mcpWd, 'encodeAggregate3', 'mcp: watchdog Multicall3 encode'],
  [mcpWd, 'slot0ViaMulticall3', 'mcp: watchdog Multicall3 slot0'],
  [mcpWd, 'cfsMcpWatchdogStatus', 'mcp: watchdog status mirror key'],
  [mcpWd, 'CFS_V3_RECONCILE_POSITIONS', 'mcp: watchdog reconcile when healthy'],
  [mcpSys, 'monitor_watchdog_status', 'mcp: watchdog status tool'],
  [mcpSys, 'monitor_watchdog_configure', 'mcp: watchdog configure tool'],
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
console.log('All BSC V3 range watch / LP workflow wiring checks passed.');
