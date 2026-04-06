/**
 * Unit tests for raydiumClmmCollectReward — payload shape mirrors handler.js.
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
      type: 'CFS_RAYDIUM_CLMM_COLLECT_REWARD',
      positionNftMint: trim(row, getRowValue, action.positionNftMint),
      rewardMint: trim(row, getRowValue, action.rewardMint),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: trim(row, getRowValue, action.rpcUrl) || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
  }

  runner.registerStepTests('raydiumClmmCollectReward', [
    { name: 'payload type', fn: function () {
      var p = buildPayload({ positionNftMint: 'NFT1', rewardMint: 'RAY' }, {});
      runner.assertEqual(p.type, 'CFS_RAYDIUM_CLMM_COLLECT_REWARD');
    }},
    { name: 'core fields', fn: function () {
      var p = buildPayload({ positionNftMint: 'NFT1', rewardMint: 'RAY' }, {});
      runner.assertEqual(p.positionNftMint, 'NFT1');
      runner.assertEqual(p.rewardMint, 'RAY');
    }},
    { name: 'template resolution', fn: function () {
      var row = { nft: 'X', reward: 'Y' };
      var p = buildPayload({ positionNftMint: '{{nft}}', rewardMint: '{{reward}}' }, row);
      runner.assertEqual(p.positionNftMint, 'X');
      runner.assertEqual(p.rewardMint, 'Y');
    }},
    { name: 'missing positionNftMint yields empty', fn: function () {
      var p = buildPayload({ rewardMint: 'RAY' }, {});
      runner.assertEqual(p.positionNftMint, '');
    }},
    { name: 'boolean defaults to false', fn: function () {
      var p = buildPayload({ positionNftMint: 'X' }, {});
      runner.assertEqual(p.skipSimulation, false);
      runner.assertEqual(p.skipPreflight, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
