/**
 * Unit tests for the pancakeFlash step.
 * Tests local payload construction only — never sends real messages.
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

  function buildPayload(action, row) {
    var r = function (f) {
      return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row || {}, getRowValue).trim();
    };
    return {
      type: 'CFS_PANCAKE_FLASH',
      poolAddress: r('poolAddress'),
      borrowToken0: action.borrowToken0 !== false && action.borrowToken0 !== 'false',
      borrowAmount: r('borrowAmount'),
      swapRouter: r('swapRouter') || '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
      swapOutputToken: r('swapOutputToken'),
      slippageBps: parseInt(action.slippageBps, 10) || 50,
      callbackContract: r('callbackContract'),
      rpcUrl: r('rpcUrl') || undefined,
      chainId: parseInt(action.chainId, 10) || 56,
    };
  }

  runner.registerStepTests('pancakeFlash', [
    { name: 'payload has correct message type', fn: function () {
      var p = buildPayload({ poolAddress: '0xpool', borrowAmount: '1000', callbackContract: '0xcb' });
      runner.assertEqual(p.type, 'CFS_PANCAKE_FLASH');
    }},
    { name: 'payload includes core fields', fn: function () {
      var p = buildPayload({ poolAddress: '0xABC', borrowAmount: '500', callbackContract: '0xDEF' });
      runner.assertEqual(p.poolAddress, '0xABC');
      runner.assertEqual(p.borrowAmount, '500');
      runner.assertEqual(p.callbackContract, '0xDEF');
    }},
    { name: 'borrowToken0 defaults to true', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc' });
      runner.assertEqual(p.borrowToken0, true);
    }},
    { name: 'borrowToken0 set to false', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc', borrowToken0: false });
      runner.assertEqual(p.borrowToken0, false);
    }},
    { name: 'slippageBps defaults to 50', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc' });
      runner.assertEqual(p.slippageBps, 50);
    }},
    { name: 'slippageBps can be overridden', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc', slippageBps: '100' });
      runner.assertEqual(p.slippageBps, 100);
    }},
    { name: 'chainId defaults to 56', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc' });
      runner.assertEqual(p.chainId, 56);
    }},
    { name: 'chainId 97 for Chapel testnet', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc', chainId: '97' });
      runner.assertEqual(p.chainId, 97);
    }},
    { name: 'template resolution in row values', fn: function () {
      var row = { addr: '0xResolved', amt: '999' };
      var p = buildPayload({ poolAddress: '{{addr}}', borrowAmount: '{{amt}}', callbackContract: '0xc' }, row);
      runner.assertEqual(p.poolAddress, '0xResolved');
      runner.assertEqual(p.borrowAmount, '999');
    }},
    { name: 'missing poolAddress yields empty string', fn: function () {
      var p = buildPayload({ borrowAmount: '1', callbackContract: '0xc' });
      runner.assertEqual(p.poolAddress, '');
    }},
    { name: 'default swapRouter when not specified', fn: function () {
      var p = buildPayload({ poolAddress: '0xp', borrowAmount: '1', callbackContract: '0xc' });
      runner.assertEqual(p.swapRouter, '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
