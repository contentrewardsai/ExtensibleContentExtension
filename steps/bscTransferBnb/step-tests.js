/**
 * Unit tests for bscTransferBnb — payload shape mirrors handler.js.
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
    var to = resolveTemplate(String(action.to || '').trim(), row, getRowValue).trim();
    var ethWei = resolveTemplate(String(action.ethWei != null ? action.ethWei : '').trim(), row, getRowValue).trim();
    return {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: 'transferNative',
      to: to,
      ethWei: ethWei,
      deadline: resolveTemplate(String(action.deadline || '').trim(), row, getRowValue).trim(),
      waitConfirmations: action.waitConfirmations,
      gasLimit: resolveTemplate(String(action.gasLimit || '').trim(), row, getRowValue).trim(),
    };
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('bscTransferBnb', [
    { name: 'buildPayload transferNative', fn: function() {
      var p = buildPayload({ to: '0xabc0000000000000000000000000000000000001', ethWei: 'max' }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_BSC_POOL_EXECUTE');
      runner.assertEqual(p.operation, 'transferNative');
      runner.assertEqual(p.to, '0xabc0000000000000000000000000000000000001');
      runner.assertEqual(p.ethWei, 'max');
    }},
    { name: 'buildPayload templates', fn: function() {
      var row = { recv: '0xdef0000000000000000000000000000000000002', w: '1000' };
      var p = buildPayload({ to: '{{recv}}', ethWei: '{{w}}' }, row, getRowValue);
      runner.assertEqual(p.to, '0xdef0000000000000000000000000000000000002');
      runner.assertEqual(p.ethWei, '1000');
    }},
    { name: 'buildPayload missing to yields empty string', fn: function() {
      var p = buildPayload({ ethWei: '100' }, {}, getRowValue);
      runner.assertEqual(p.to, '');
      runner.assertEqual(p.operation, 'transferNative');
    }},
    { name: 'buildPayload missing ethWei yields empty string', fn: function() {
      var p = buildPayload({ to: '0xabc0000000000000000000000000000000000001' }, {}, getRowValue);
      runner.assertEqual(p.ethWei, '');
    }},
    { name: 'buildPayload deadline and gasLimit empty by default', fn: function() {
      var p = buildPayload({ to: '0xabc', ethWei: '1' }, {}, getRowValue);
      runner.assertEqual(p.deadline, '');
      runner.assertEqual(p.gasLimit, '');
    }},
    { name: 'buildPayload deadline from template', fn: function() {
      var row = { dl: '300' };
      var p = buildPayload({ to: '0xabc', ethWei: '1', deadline: '{{dl}}' }, row, getRowValue);
      runner.assertEqual(p.deadline, '300');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
