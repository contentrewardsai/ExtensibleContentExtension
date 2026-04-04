#!/usr/bin/env node
/**
 * Guard: Pancake Infinity BSC wiring (no chain).
 * Run: node scripts/verify-bsc-infinity-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const paths = {
  sw: path.join(root, 'background', 'service-worker.js'),
  evm: path.join(root, 'background', 'bsc-evm.js'),
  bundle: path.join(root, 'background', 'infinity-sdk.bundle.js'),
  stepQ: path.join(root, 'steps', 'bscQuery', 'step.json'),
  stepP: path.join(root, 'steps', 'bscPancake', 'step.json'),
  manifest: path.join(root, 'manifest.json'),
  pathJsonVerify: path.join(root, 'scripts', 'verify-infi-bin-path-json.cjs'),
  sharedInfiShape: path.join(root, 'shared', 'infi-bin-path-json-shape.js'),
};

for (const [k, p] of Object.entries(paths)) {
  if (!fs.existsSync(p)) {
    console.error('verify-bsc-infinity-wired: missing', k, path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(paths.sw, 'utf8');
const evm = fs.readFileSync(paths.evm, 'utf8');
const stepQ = fs.readFileSync(paths.stepQ, 'utf8');
const stepP = fs.readFileSync(paths.stepP, 'utf8');
const man = fs.readFileSync(paths.manifest, 'utf8');
const pathJson = fs.readFileSync(paths.pathJsonVerify, 'utf8');
const shapeJs = fs.readFileSync(paths.sharedInfiShape, 'utf8');

const checks = [
  [sw, 'infinity-sdk.bundle.js', 'service-worker: importScripts infinity bundle'],
  [sw, '../shared/infi-bin-path-json-shape.js', 'service-worker: importScripts Infinity path shape'],
  [sw, 'validateInfiBinPathJsonField', 'service-worker: Infinity path JSON field validation'],
  [sw, 'CFS_parseInfiBinPathJsonShape', 'service-worker: Infinity path shape parse global'],
  [sw, "qop === 'infiBinQuoteExactInputSingle'", 'service-worker: CFS_BSC_QUERY BinQuoter validation'],
  [sw, "qop === 'infiBinQuoteExactInput'", 'service-worker: CFS_BSC_QUERY infiBinQuoteExactInput validation'],
  [sw, "qop === 'infiBinQuoteExactOutput'", 'service-worker: CFS_BSC_QUERY infiBinQuoteExactOutput validation'],
  [sw, "qop === 'infiBinPoolId'", 'service-worker: CFS_BSC_QUERY infiBinPoolId validation'],
  [sw, "op === 'infiBinAddLiquidity'", 'service-worker: CFS_BSC_POOL_EXECUTE infiBinAddLiquidity validation'],
  [sw, "op === 'infiBinSwapExactInSingle'", 'service-worker: CFS_BSC_POOL_EXECUTE infiBinSwapExactInSingle validation'],
  [sw, "op === 'infiBinSwapExactIn'", 'service-worker: CFS_BSC_POOL_EXECUTE infiBinSwapExactIn validation'],
  [sw, "op === 'infiBinSwapExactOut'", 'service-worker: CFS_BSC_POOL_EXECUTE infiBinSwapExactOut validation'],
  [sw, "op === 'infiBinSwapExactOutSingle'", 'service-worker: CFS_BSC_POOL_EXECUTE infiBinSwapExactOutSingle validation'],
  [evm, "op === 'infiFarmClaim'", 'bsc-evm: infiFarmClaim execute'],
  [evm, 'infiFarmClaimSkipIfNoRewards', 'bsc-evm: infiFarmClaim skip-if-empty flag'],
  [evm, "op === 'infiBinSwapExactInSingle'", 'bsc-evm: infiBinSwapExactInSingle execute'],
  [evm, "op === 'infiBinSwapExactIn'", 'bsc-evm: infiBinSwapExactIn execute'],
  [evm, 'parseInfiBinPathJson', 'bsc-evm: Infinity multi-hop path JSON parser'],
  [evm, 'CFS_parseInfiBinPathJsonShape', 'bsc-evm: path JSON parse delegates to shared shape'],
  [evm, "op === 'infiBinQuoteExactInput'", 'bsc-evm: infiBinQuoteExactInput query'],
  [evm, 'buildInfinityBinPathKeysFromHopsReverse', 'bsc-evm: multi-hop exact-out path builder'],
  [evm, "op === 'infiBinQuoteExactOutput'", 'bsc-evm: infiBinQuoteExactOutput query'],
  [evm, "op === 'infiBinSwapExactOut'", 'bsc-evm: infiBinSwapExactOut execute'],
  [evm, "op === 'infiBinSwapExactOutSingle'", 'bsc-evm: infiBinSwapExactOutSingle execute'],
  [evm, "op === 'infiBinSlot0'", 'bsc-evm: infiBinSlot0 query'],
  [evm, "op === 'infiBinQuoteExactInputSingle'", 'bsc-evm: infiBinQuoteExactInputSingle query'],
  [evm, 'INFI_BIN_POOL_MANAGER_BSC', 'bsc-evm: Infinity pins'],
  [evm, 'resolveInfinityBinPositionManager', 'bsc-evm: BinPositionManager resolve helper'],
  [evm, 'resolveInfinityDistributor', 'bsc-evm: Farming Distributor resolve helper'],
  [stepQ, '"value": "infiBinPoolId"', 'bscQuery step: infiBinPoolId option'],
  [stepQ, '"value": "infiBinQuoteExactInput"', 'bscQuery step: infiBinQuoteExactInput option'],
  [stepQ, '"value": "infiBinQuoteExactOutput"', 'bscQuery step: infiBinQuoteExactOutput option'],
  [stepP, '"value": "infiFarmClaim"', 'bscPancake step: infiFarmClaim option'],
  [stepP, '"value": "infiBinSwapExactInSingle"', 'bscPancake step: infiBinSwapExactInSingle option'],
  [stepP, '"value": "infiBinSwapExactIn"', 'bscPancake step: infiBinSwapExactIn option'],
  [stepP, '"value": "infiBinSwapExactOut"', 'bscPancake step: infiBinSwapExactOut option'],
  [stepP, '"value": "infiBinSwapExactOutSingle"', 'bscPancake step: infiBinSwapExactOutSingle option'],
  [stepP, '"key": "binPositionManagerAddress"', 'bscPancake step: binPositionManagerAddress field'],
  [stepP, '"key": "distributorAddress"', 'bscPancake step: distributorAddress field'],
  [man, 'infinity.pancakeswap.com', 'manifest: Infinity API host permission'],
  [shapeJs, 'MAX_HOPS', 'shared infi path: hop limit'],
  [shapeJs, '0xffffff', 'shared infi path: uint24 fee bound'],
  [shapeJs, 'CFS_parseInfiBinPathJsonShape', 'shared infi path: parse export'],
  [shapeJs, 'CFS_infiBinPathCurrencyChainError', 'shared infi path: chain walk export'],
  [shapeJs, '32000', 'shared infi path: max JSON length'],
  [pathJson, 'infi-bin-path-json-shape.js', 'verify-infi-bin-path-json: requires shared shape module'],
  [pathJson, 'walkInfiBinPathCurrencyChain', 'verify-infi-bin-path-json: currency chain walk helper'],
  [pathJson, 'CFS_parseInfiBinPathJsonShape', 'verify-infi-bin-path-json: uses shared parse'],
];

for (const [text, needle, label] of checks) {
  if (!text.includes(needle)) {
    console.error('verify-bsc-infinity-wired: missing:', label);
    process.exit(1);
  }
}

console.log('verify-bsc-infinity-wired: OK');
process.exit(0);
