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
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    var solLamports = resolveTemplate(String(action.solLamports != null ? action.solLamports : '').trim(), row, getRowValue, action).trim();
    var slippage = Math.max(0, parseInt(action.slippage, 10) || 1);
    return { type: 'CFS_PUMPFUN_BUY', mint: mint, solLamports: solLamports, slippage: slippage, cluster: String(action.cluster || 'mainnet-beta').trim() };
  }
  function gv(row, k) { return row && Object.prototype.hasOwnProperty.call(row, k) ? row[k] : undefined; }
  runner.registerStepTests('solanaPumpfunBuy', [
    { name: 'message type and fields', fn: function () {
      var m = buildMsg({ mint: 'M1', solLamports: '1000' }, {}, gv);
      runner.assertEqual(m.type, 'CFS_PUMPFUN_BUY');
      runner.assertEqual(m.mint, 'M1');
      runner.assertEqual(m.solLamports, '1000');
      runner.assertEqual(m.slippage, 1);
    }},
    { name: 'template mint', fn: function () {
      var m = buildMsg({ mint: '{{m}}', solLamports: '1' }, { m: 'X' }, gv);
      runner.assertEqual(m.mint, 'X');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
