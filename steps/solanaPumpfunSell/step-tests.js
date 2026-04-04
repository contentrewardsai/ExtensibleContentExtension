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
  function buildMsg(action, row, getRowValue) {
    return {
      type: 'CFS_PUMPFUN_SELL',
      mint: resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim(),
      tokenAmountRaw: resolveTemplate(String(action.tokenAmountRaw != null ? action.tokenAmountRaw : '').trim(), row, getRowValue, action).trim(),
      slippage: Math.max(0, parseInt(action.slippage, 10) || 1),
    };
  }
  function gv(row, k) { return row && Object.prototype.hasOwnProperty.call(row, k) ? row[k] : undefined; }
  runner.registerStepTests('solanaPumpfunSell', [
    { name: 'CFS_PUMPFUN_SELL shape', fn: function () {
      var m = buildMsg({ mint: 'M', tokenAmountRaw: '99' }, {}, gv);
      runner.assertEqual(m.type, 'CFS_PUMPFUN_SELL');
      runner.assertEqual(m.tokenAmountRaw, '99');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
