/**
 * Unit tests for bscSellabilityProbe — outbound payload mirrors handler.js (before sendMessage).
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue, action) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function buildProbePayload(action, row, getRowValue) {
    var token = resolveTemplate(String(action.token || '').trim(), row, getRowValue, action).trim();
    var spendBnbWei = resolveTemplate(String(action.spendBnbWei != null ? action.spendBnbWei : '').trim(), row, getRowValue, action).trim();
    var gasLimit = resolveTemplate(String(action.gasLimit != null ? action.gasLimit : '').trim(), row, getRowValue, action).trim();
    var spendUsdApprox = action.spendUsdApprox;
    if (spendUsdApprox != null && String(spendUsdApprox).trim() !== '') {
      var s = resolveTemplate(String(spendUsdApprox).trim(), row, getRowValue, action).trim();
      var n = parseFloat(s);
      if (Number.isFinite(n) && n > 0) spendUsdApprox = n;
    }
    var payload = {
      type: 'CFS_BSC_SELLABILITY_PROBE',
      token: token,
      slippage:
        action.slippage != null && String(action.slippage).trim() !== ''
          ? Math.min(5000, Math.max(0, Number(action.slippage)))
          : 150,
      waitConfirmations: Math.max(0, Math.min(64, parseInt(action.waitConfirmations, 10) || 1)),
      balancePollIntervalMs: parseInt(action.balancePollIntervalMs, 10) || 500,
      balancePollMaxMs: parseInt(action.balancePollMaxMs, 10) || 60000,
    };
    if (spendBnbWei) payload.spendBnbWei = spendBnbWei;
    else if (spendUsdApprox != null && Number.isFinite(Number(spendUsdApprox)) && Number(spendUsdApprox) > 0) {
      payload.spendUsdApprox = Number(spendUsdApprox);
    }
    if (gasLimit) payload.gasLimit = gasLimit;
    if (action.forceApprove === true) payload.forceApprove = true;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('bscSellabilityProbe', [
    { name: 'payload spendBnbWei overrides USD', fn: function() {
      var p = buildProbePayload({
        token: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        spendBnbWei: '1000000000000000',
        spendUsdApprox: 99,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_BSC_SELLABILITY_PROBE');
      runner.assertEqual(p.spendBnbWei, '1000000000000000');
      runner.assertEqual(p.spendUsdApprox, undefined);
    }},
    { name: 'payload spendUsdApprox', fn: function() {
      var p = buildProbePayload({ token: '0xabc', spendUsdApprox: 1 }, {}, getRowValue);
      runner.assertEqual(p.spendUsdApprox, 1);
    }},
    { name: 'slippage capped', fn: function() {
      var p = buildProbePayload({ token: '0xabc', spendUsdApprox: 1, slippage: '99999' }, {}, getRowValue);
      runner.assertEqual(p.slippage, 5000);
    }},
    { name: 'waitConfirmations clamped', fn: function() {
      var p = buildProbePayload({ token: '0xabc', spendUsdApprox: 1, waitConfirmations: 999 }, {}, getRowValue);
      runner.assertEqual(p.waitConfirmations, 64);
    }},
    { name: 'forceApprove optional', fn: function() {
      var p = buildProbePayload({ token: '0xabc', spendUsdApprox: 1, forceApprove: true }, {}, getRowValue);
      runner.assertEqual(p.forceApprove, true);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
