/**
 * Unit tests for bscQuery outbound message shape (mirrors handler.js fields).
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

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  function buildBscQueryMessage(action, row, getRowValue) {
    return {
      type: 'CFS_BSC_QUERY',
      operation: trimResolved(row, getRowValue, action, action.operation),
      txHash: trimResolved(row, getRowValue, action, action.txHash),
      address: trimResolved(row, getRowValue, action, action.address),
      token: trimResolved(row, getRowValue, action, action.token),
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('bscQuery', [
    { name: 'message type and operation', fn: function () {
      var m = buildBscQueryMessage({ operation: 'rpcInfo' }, {}, getRowValue);
      runner.assertEqual(m.type, 'CFS_BSC_QUERY');
      runner.assertEqual(m.operation, 'rpcInfo');
    }},
    { name: 'templates resolve', fn: function () {
      var row = { op: 'getBalance', addr: '0xabc' };
      var m = buildBscQueryMessage({ operation: '{{op}}', address: '{{addr}}' }, row, getRowValue);
      runner.assertEqual(m.operation, 'getBalance');
      runner.assertEqual(m.address, '0xabc');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
