#!/usr/bin/env node
/**
 * Guard: sellability probe modules and message types wired in the service worker.
 * Run: node scripts/verify-sellability-probe-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const solPath = path.join(root, 'background', 'solana-sellability-probe.js');
const bscPath = path.join(root, 'background', 'bsc-sellability-probe.js');
const evmPath = path.join(root, 'background', 'bsc-evm.js');
const solStepTests = path.join(root, 'steps', 'solanaSellabilityProbe', 'step-tests.js');
const bscStepTests = path.join(root, 'steps', 'bscSellabilityProbe', 'step-tests.js');

for (const p of [swPath, solPath, bscPath, evmPath, solStepTests, bscStepTests]) {
  if (!fs.existsSync(p)) {
    console.error('verify-sellability-probe-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const needles = [
  ["importScripts solana-sellability-probe", "importScripts('solana-sellability-probe.js')"],
  ["importScripts bsc-sellability-probe", "importScripts('bsc-sellability-probe.js')"],
  ['validate CFS_SOLANA_SELLABILITY_PROBE', "case 'CFS_SOLANA_SELLABILITY_PROBE':"],
  ['validate CFS_BSC_SELLABILITY_PROBE', "case 'CFS_BSC_SELLABILITY_PROBE':"],
  ['onMessage CFS_SOLANA_SELLABILITY_PROBE', "type === 'CFS_SOLANA_SELLABILITY_PROBE'"],
  ['onMessage CFS_BSC_SELLABILITY_PROBE', "type === 'CFS_BSC_SELLABILITY_PROBE'"],
  ['handler __CFS_solana_sellability_probe', '__CFS_solana_sellability_probe'],
  ['handler __CFS_bsc_sellability_probe', '__CFS_bsc_sellability_probe'],
];

for (const [label, needle] of needles) {
  if (!sw.includes(needle)) {
    console.error('verify-sellability-probe-wired: service-worker.js missing:', label);
    process.exit(1);
  }
}

const sol = fs.readFileSync(solPath, 'utf8');
if (!sol.includes('globalThis.__CFS_solana_sellability_probe')) {
  console.error('verify-sellability-probe-wired: solana-sellability-probe.js missing export');
  process.exit(1);
}
if (!sol.includes('applyJupiterCrossCheckToSwapPayload')) {
  console.error('verify-sellability-probe-wired: solana-sellability-probe.js missing Jupiter cross-check helper');
  process.exit(1);
}

const bsc = fs.readFileSync(bscPath, 'utf8');
if (!bsc.includes('globalThis.__CFS_bsc_sellability_probe')) {
  console.error('verify-sellability-probe-wired: bsc-sellability-probe.js missing export');
  process.exit(1);
}
if (!bsc.includes('readAllowance') || !bsc.includes('approveSkipped')) {
  console.error('verify-sellability-probe-wired: bsc-sellability-probe.js missing allowance skip optimization');
  process.exit(1);
}

const evm = fs.readFileSync(evmPath, 'utf8');
if (!evm.includes('PARASWAP_AUGUSTUS_BSC_OK') || !evm.includes('0xdef171fe48cf0115b1d80b88dc8eab59176fee57')) {
  console.error('verify-sellability-probe-wired: bsc-evm.js missing ParaSwap Augustus approve allowlist');
  process.exit(1);
}

const solSt = fs.readFileSync(solStepTests, 'utf8');
if (!solSt.includes("registerStepTests('solanaSellabilityProbe'")) {
  console.error('verify-sellability-probe-wired: solana step-tests missing registerStepTests');
  process.exit(1);
}
const bscSt = fs.readFileSync(bscStepTests, 'utf8');
if (!bscSt.includes("registerStepTests('bscSellabilityProbe'")) {
  console.error('verify-sellability-probe-wired: bsc step-tests missing registerStepTests');
  process.exit(1);
}

console.log('verify-sellability-probe-wired: OK');
