/**
 * Unit tests for bscTransferBep20 — payload shape mirrors handler.js.
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

  function buildPayload(action, row, getRowValue) {
    return {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferErc20',
      token: resolveTemplate(String(action.token || '').trim(), row, getRowValue).trim(),
      to: resolveTemplate(String(action.to || '').trim(), row, getRowValue).trim(),
      amount: resolveTemplate(String(action.amount != null ? action.amount : '').trim(), row, getRowValue).trim(),
      deadline: resolveTemplate(String(action.deadline || '').trim(), row, getRowValue).trim(),
      waitConfirmations: action.waitConfirmations,
      gasLimit: resolveTemplate(String(action.gasLimit || '').trim(), row, getRowValue).trim(),
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('bscTransferBep20', [
    { name: 'buildPayload transferErc20', fn: function() {
      var p = buildPayload({
        token: '0x55d398326f99059fF775485246999027B3197955',
        to: '0x1111111111111111111111111111111111111111',
        amount: '1000',
      }, {}, getRowValue);
      runner.assertEqual(p.operation, 'transferErc20');
      runner.assertEqual(p.amount, '1000');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
