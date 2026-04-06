/**
 * Unit tests for raydiumClmmClosePosition — payload shape mirrors handler.js.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }
  function trim(row, getRowValue, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue).trim();
  }
  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function buildPayload(action, row) {
    return {
      type: 'CFS_RAYDIUM_CLMM_CLOSE_POSITION',
      positionNftMint: trim(row, getRowValue, action.positionNftMint),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: trim(row, getRowValue, action.rpcUrl) || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
  }

  runner.registerStepTests('raydiumClmmClosePosition', [
    { name: 'payload type', fn: function () {
      var p = buildPayload({ positionNftMint: 'NFT1' }, {});
      runner.assertEqual(p.type, 'CFS_RAYDIUM_CLMM_CLOSE_POSITION');
      runner.assertEqual(p.positionNftMint, 'NFT1');
    }},
    { name: 'template resolution', fn: function () {
      var row = { nft: 'ABC123' };
      var p = buildPayload({ positionNftMint: '{{nft}}' }, row);
      runner.assertEqual(p.positionNftMint, 'ABC123');
    }},
    { name: 'missing positionNftMint yields empty', fn: function () {
      var p = buildPayload({}, {});
      runner.assertEqual(p.positionNftMint, '');
    }},
    { name: 'cluster defaults to mainnet-beta', fn: function () {
      var p = buildPayload({ positionNftMint: 'X' }, {});
      runner.assertEqual(p.cluster, 'mainnet-beta');
    }},
    { name: 'boolean defaults to false', fn: function () {
      var p = buildPayload({ positionNftMint: 'X' }, {});
      runner.assertEqual(p.skipSimulation, false);
      runner.assertEqual(p.skipPreflight, false);
    }},
    { name: 'rpcUrl omitted when empty', fn: function () {
      var p = buildPayload({ positionNftMint: 'X', rpcUrl: '' }, {});
      runner.assertEqual(p.rpcUrl, undefined);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
