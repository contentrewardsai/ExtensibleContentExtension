/**
 * Unit tests for meteoraCpammQuoteSwapExactOut — sendMessage payload mirrors handler.js.
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

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function buildPayload(action, row) {
    var pool = resolveTemplate(String(action.pool || '').trim(), row, getRowValue).trim();
    var inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue).trim();
    var outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue).trim();
    var amountOutRaw = resolveTemplate(String(action.amountOutRaw != null ? action.amountOutRaw : '').trim(), row, getRowValue).trim();
    var maximumAmountInRaw = resolveTemplate(String(action.maximumAmountInRaw != null ? action.maximumAmountInRaw : '').trim(), row, getRowValue).trim();
    var slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT',
      pool: pool,
      inputMint: inputMint,
      outputMint: outputMint,
      amountOutRaw: amountOutRaw,
      slippagePercent: slippagePercent,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (maximumAmountInRaw) payload.maximumAmountInRaw = maximumAmountInRaw;
    return payload;
  }

  runner.registerStepTests('meteoraCpammQuoteSwapExactOut', [
    { name: 'payload shape', fn: function() {
      var p = buildPayload({
        pool: 'Pool111111111111111111111111111111111111111',
        inputMint: 'MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        outputMint: 'MintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        amountOutRaw: '1000000',
        slippagePercent: 2,
      }, {});
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT');
      runner.assertEqual(p.amountOutRaw, '1000000');
      runner.assertEqual(p.slippagePercent, 2);
    }},
    { name: 'optional maximumAmountInRaw', fn: function() {
      var p = buildPayload({
        pool: 'P',
        inputMint: 'A',
        outputMint: 'B',
        amountOutRaw: '1',
        maximumAmountInRaw: '777',
      }, {});
      runner.assertEqual(p.maximumAmountInRaw, '777');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
