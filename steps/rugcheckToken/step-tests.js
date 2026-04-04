/**
 * Unit tests for rugcheckToken message shape and row save behavior.
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

  function buildRugcheckMessage(action, row, getRowValue) {
    return { type: 'CFS_RUGCHECK_TOKEN_REPORT', mint: trimResolved(row, getRowValue, action, action.mint) };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('rugcheckToken', [
    { name: 'message mint literal', fn: function () {
      var m = buildRugcheckMessage({ mint: 'So11111111111111111111111111111111111111112' }, {}, getRowValue);
      runner.assertEqual(m.type, 'CFS_RUGCHECK_TOKEN_REPORT');
      runner.assertEqual(m.mint, 'So11111111111111111111111111111111111111112');
    }},
    { name: 'message mint template', fn: function () {
      var row = { mintVar: 'MintAddr' };
      var m = buildRugcheckMessage({ mint: '{{mintVar}}' }, row, getRowValue);
      runner.assertEqual(m.mint, 'MintAddr');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
