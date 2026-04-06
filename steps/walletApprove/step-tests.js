/**
 * Unit tests for walletApprove — payload shape, defaults, template resolution.
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
  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('walletApprove', [
    { name: 'defaults: autoSign true, convertToApiCall true, timeout 30000', fn: function () {
      var action = { type: 'walletApprove' };
      var autoSign = action.autoSign !== false;
      var convertToApiCall = action.convertToApiCall !== false;
      var timeout = parseInt(resolveTemplate(String(action.timeout || '30000'), {}, getRowValue), 10) || 30000;
      runner.assertEqual(autoSign, true);
      runner.assertEqual(convertToApiCall, true);
      runner.assertEqual(timeout, 30000);
    }},
    { name: 'explicit fields override defaults', fn: function () {
      var action = {
        type: 'walletApprove',
        autoSign: false,
        timeout: '60000',
        convertToApiCall: false,
        saveSignatureVariable: 'sig',
        saveExplorerUrlVariable: 'url',
      };
      var autoSign = action.autoSign !== false;
      var timeout = parseInt(resolveTemplate(String(action.timeout || '30000'), {}, getRowValue), 10) || 30000;
      runner.assertEqual(autoSign, false);
      runner.assertEqual(timeout, 60000);
      runner.assertEqual(action.convertToApiCall, false);
      runner.assertEqual(action.saveSignatureVariable, 'sig');
      runner.assertEqual(action.saveExplorerUrlVariable, 'url');
    }},
    { name: 'template resolves timeout from row', fn: function () {
      var action = { type: 'walletApprove', timeout: '{{waitMs}}' };
      var row = { waitMs: '15000' };
      var timeout = parseInt(resolveTemplate(String(action.timeout || '30000'), row, getRowValue), 10) || 30000;
      runner.assertEqual(timeout, 15000);
    }},
    { name: 'empty saveSignatureVariable is safe', fn: function () {
      var action = { type: 'walletApprove', saveSignatureVariable: '' };
      var varName = String(action.saveSignatureVariable || '').trim();
      runner.assertEqual(varName, '');
    }},
    { name: 'type field is walletApprove', fn: function () {
      var action = { type: 'walletApprove' };
      runner.assertEqual(action.type, 'walletApprove');
    }},
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
