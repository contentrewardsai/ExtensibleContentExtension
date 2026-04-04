/**
 * Unit tests for meteoraDlmmRemoveLiquidity — sendMessage payload mirrors handler.js.
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

  function buildRemovePayload(action, row, getRowValue) {
    var lbPair = resolveTemplate(String(action.lbPair || '').trim(), row, getRowValue).trim();
    var position = resolveTemplate(String(action.position || '').trim(), row, getRowValue).trim();
    var removeBps = Math.min(10000, Math.max(1, parseInt(action.removeBps, 10) || 10000));
    var shouldClaimAndClose = action.shouldClaimAndClose !== false;
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    return {
      type: 'CFS_METEORA_DLMM_REMOVE_LIQUIDITY',
      lbPair: lbPair,
      position: position,
      removeBps: removeBps,
      shouldClaimAndClose: shouldClaimAndClose,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('meteoraDlmmRemoveLiquidity', [
    { name: 'buildRemovePayload defaults', fn: function () {
      var p = buildRemovePayload({
        lbPair: 'Lb',
        position: 'Pos',
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_METEORA_DLMM_REMOVE_LIQUIDITY');
      runner.assertEqual(p.removeBps, 10000);
      runner.assertEqual(p.shouldClaimAndClose, true);
    }},
    { name: 'buildRemovePayload partial remove and no close', fn: function () {
      var p = buildRemovePayload({
        lbPair: 'L', position: 'P', removeBps: 5000, shouldClaimAndClose: false,
      }, {}, getRowValue);
      runner.assertEqual(p.removeBps, 5000);
      runner.assertEqual(p.shouldClaimAndClose, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
