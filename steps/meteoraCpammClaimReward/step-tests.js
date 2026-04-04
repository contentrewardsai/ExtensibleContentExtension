/**
 * Unit tests for meteoraCpammClaimReward — sendMessage payload mirrors handler.js.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function buildPayload(action, row) {
    var pool = resolveTemplate(String(action.pool || '').trim(), row, getRowValue).trim();
    var position = resolveTemplate(String(action.position || '').trim(), row, getRowValue).trim();
    var rewardIndexRaw = resolveTemplate(
      String(action.rewardIndex != null ? action.rewardIndex : '0').trim(),
      row,
      getRowValue
    ).trim();
    var ri = parseInt(rewardIndexRaw, 10);
    var rewardIndex = Number.isFinite(ri) && ri >= 0 && ri <= 1 ? ri : 0;
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_METEORA_CPAMM_CLAIM_REWARD',
      position: position,
      rewardIndex: rewardIndex,
      isSkipReward: action.isSkipReward === true,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (pool) payload.pool = pool;
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    var cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  runner.registerStepTests('meteoraCpammClaimReward', [
    { name: 'payload defaults rewardIndex 0', fn: function() {
      var p = buildPayload({ position: 'Pos111111111111111111111111111111111111111' }, {});
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_CLAIM_REWARD');
      runner.assertEqual(p.rewardIndex, 0);
    }},
    { name: 'rewardIndex 1', fn: function() {
      var p = buildPayload({ position: 'P', rewardIndex: 1 }, {});
      runner.assertEqual(p.rewardIndex, 1);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
