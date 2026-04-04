#!/usr/bin/env node
/**
 * Guard: Infinity multi-hop infiBinPathJson shape (no RPC, no bsc-evm import).
 * Delegates to shared/infi-bin-path-json-shape.js (same logic as service worker + bsc-evm early checks).
 * Run: node scripts/verify-infi-bin-path-json.cjs
 */
'use strict';

const pathMod = require('path');
const {
  CFS_parseInfiBinPathJsonShape,
  CFS_infiBinPathCurrencyChainError,
} = require(pathMod.join(__dirname, '..', 'shared', 'infi-bin-path-json-shape.js'));

/**
 * @param {string} raw
 * @returns {object[]} hops
 */
function parseInfiBinPathJson(raw) {
  const r = CFS_parseInfiBinPathJsonShape(raw);
  if (!r.ok) throw new Error(r.error);
  return r.hops;
}

/**
 * @param {string} currencyInRaw
 * @param {object[]} hops
 */
function walkInfiBinPathCurrencyChain(currencyInRaw, hops) {
  const e = CFS_infiBinPathCurrencyChainError(currencyInRaw, hops);
  if (e) throw new Error(e);
}

function runCase(label, fn, expectOk) {
  let ok = true;
  try {
    fn();
  } catch (_) {
    ok = false;
  }
  if (expectOk && !ok) {
    console.error('verify-infi-bin-path-json: expected OK:', label);
    process.exit(1);
  }
  if (!expectOk && ok) {
    console.error('verify-infi-bin-path-json: expected failure:', label);
    process.exit(1);
  }
}

// Valid: illustrative addresses (shape only; not a live route).
const oneHop = JSON.stringify([
  {
    intermediateCurrency: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    infinityFee: '3000',
    binStep: '10',
  },
]);

const twoHop = JSON.stringify([
  {
    intermediateCurrency: '0x55d398326f99059fF775485246999027B3197955',
    infinityFee: '3000',
    binStep: '10',
    hookData: '0x',
  },
  {
    intermediateCurrency: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    infinityFee: '500',
    binStep: '1',
    infinityHooks: '0x0000000000000000000000000000000000000000',
  },
]);

parseInfiBinPathJson(oneHop);
const hops2 = parseInfiBinPathJson(twoHop);
walkInfiBinPathCurrencyChain('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', hops2); // illustrative "in" ≠ first hop

runCase('empty array', () => parseInfiBinPathJson('[]'), false);
runCase(
  'too many hops',
  () =>
    parseInfiBinPathJson(
      JSON.stringify(
        Array.from({ length: 9 }, (_, i) => ({
          intermediateCurrency: '0x' + (i + 1).toString(16).padStart(40, '0'),
          infinityFee: '1',
          binStep: '1',
        })),
      ),
    ),
  false,
);
runCase('missing fee', () => parseInfiBinPathJson(JSON.stringify([{ intermediateCurrency: '0x2', binStep: '1' }])), false);
runCase('not array', () => parseInfiBinPathJson('{}'), false);
runCase('fee not uint24', () => parseInfiBinPathJson(JSON.stringify([{ intermediateCurrency: '0x1', infinityFee: '16777216', binStep: '1' }])), false);
runCase('binStep 0', () => parseInfiBinPathJson(JSON.stringify([{ intermediateCurrency: '0x1', infinityFee: '100', binStep: '0' }])), false);
runCase('binStep 101', () => parseInfiBinPathJson(JSON.stringify([{ intermediateCurrency: '0x1', infinityFee: '100', binStep: '101' }])), false);
runCase(
  'hooks reg array',
  () =>
    parseInfiBinPathJson(
      JSON.stringify([
        {
          intermediateCurrency: '0x1',
          infinityFee: '100',
          binStep: '1',
          infinityHooksRegistrationJson: '[]',
        },
      ]),
    ),
  false,
);

const hopsDup = parseInfiBinPathJson(
  JSON.stringify([{ intermediateCurrency: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', infinityFee: '100', binStep: '1' }]),
);
runCase(
  'currencyIn equals first intermediate',
  () => walkInfiBinPathCurrencyChain('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', hopsDup),
  false,
);

console.log('verify-infi-bin-path-json: OK');
process.exit(0);
