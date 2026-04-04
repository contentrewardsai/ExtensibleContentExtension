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
  function gv(row, k) { return row && Object.prototype.hasOwnProperty.call(row, k) ? row[k] : undefined; }
  runner.registerStepTests('bscPancake', [
    { name: 'message type CFS_BSC_POOL_EXECUTE', fn: function () {
      var op = trimResolved({}, gv, {}, 'swapExactETHForTokens');
      runner.assertEqual({ type: 'CFS_BSC_POOL_EXECUTE', operation: op }.type, 'CFS_BSC_POOL_EXECUTE');
      runner.assertEqual(op, 'swapExactETHForTokens');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
