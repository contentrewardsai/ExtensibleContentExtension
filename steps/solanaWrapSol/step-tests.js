/**
 * Unit tests for solanaWrapSol
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
    var lamports = resolveTemplate(String(action.lamports != null ? action.lamports : '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_SOLANA_WRAP_SOL',
      lamports: lamports,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('solanaWrapSol', [
    { name: 'buildPayload', fn: function () {
      var p = buildPayload({ lamports: '5000000', cluster: 'mainnet-beta' }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_WRAP_SOL');
      runner.assertEqual(p.lamports, '5000000');
    }},
    { name: 'buildPayload template lamports', fn: function () {
      var p = buildPayload({ lamports: '{{wrapAmt}}' }, { wrapAmt: '100' }, getRowValue);
      runner.assertEqual(p.lamports, '100');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
