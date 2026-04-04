/**
 * Unit tests for solanaUnwrapSol
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

  function buildPayload(action, row, getRowValue) {
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    return {
      type: 'CFS_SOLANA_UNWRAP_WSOL',
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipPreflight: action.skipPreflight === true,
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('solanaUnwrapSol', [
    { name: 'buildPayload', fn: function () {
      var p = buildPayload({ cluster: 'devnet', skipPreflight: true }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_UNWRAP_WSOL');
      runner.assertEqual(p.cluster, 'devnet');
      runner.assertEqual(p.skipPreflight, true);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
