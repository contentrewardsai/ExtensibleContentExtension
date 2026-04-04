/**
 * Unit tests for meteoraCpammQuoteSwap — sendMessage payload mirrors handler.js.
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
    var amountInRaw = resolveTemplate(String(action.amountInRaw != null ? action.amountInRaw : '').trim(), row, getRowValue).trim();
    var slippagePercent = Math.min(50, Math.max(0.01, Number(action.slippagePercent) || 1));
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    return {
      type: 'CFS_METEORA_CPAMM_QUOTE_SWAP',
      pool: pool,
      inputMint: inputMint,
      outputMint: outputMint,
      amountInRaw: amountInRaw,
      slippagePercent: slippagePercent,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
    };
  }

  runner.registerStepTests('meteoraCpammQuoteSwap', [
    { name: 'payload shape', fn: function() {
      var p = buildPayload({
        pool: 'Pool111111111111111111111111111111111111111',
        inputMint: 'MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        outputMint: 'MintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        amountInRaw: '1000000',
        slippagePercent: 0.5,
      }, {});
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_QUOTE_SWAP');
      runner.assertEqual(p.amountInRaw, '1000000');
      runner.assertEqual(p.slippagePercent, 0.5);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
