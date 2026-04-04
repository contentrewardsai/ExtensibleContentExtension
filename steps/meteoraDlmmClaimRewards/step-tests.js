/**
 * Unit tests for meteoraDlmmClaimRewards — sendMessage payload mirrors handler.js.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function buildClaimPayload(action, row, getRowValue) {
    var lbPair = resolveTemplate(String(action.lbPair || '').trim(), row, getRowValue).trim();
    var position = resolveTemplate(String(action.position || '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    return {
      type: 'CFS_METEORA_DLMM_CLAIM_REWARDS',
      lbPair: lbPair,
      position: position,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('meteoraDlmmClaimRewards', [
    { name: 'buildClaimPayload core', fn: function () {
      var p = buildClaimPayload({
        lbPair: 'Pool111111111111111111111111111111111111111',
        position: 'Pos222222222222222222222222222222222222222',
        cluster: 'devnet',
        skipPreflight: true,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_METEORA_DLMM_CLAIM_REWARDS');
      runner.assertEqual(p.cluster, 'devnet');
      runner.assertEqual(p.skipPreflight, true);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
