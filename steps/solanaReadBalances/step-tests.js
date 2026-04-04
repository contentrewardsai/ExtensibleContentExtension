/**
 * Unit tests for solanaReadBalances
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = key.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function buildNativePayload(action, row, getRowValue) {
    var owner = resolveTemplate(String(action.owner || '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var base = { cluster: cluster, rpcUrl: rpcUrl || undefined };
    if (owner) base.owner = owner;
    return Object.assign({ type: 'CFS_SOLANA_RPC_READ', readKind: 'nativeBalance' }, base);
  }

  function buildTokenPayload(action, row, getRowValue) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue).trim();
    var tokenProgram = String(action.tokenProgram || 'token').trim();
    var owner = resolveTemplate(String(action.owner || '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var base = { cluster: cluster, rpcUrl: rpcUrl || undefined, mint: mint, tokenProgram: tokenProgram };
    if (owner) base.owner = owner;
    return Object.assign({ type: 'CFS_SOLANA_RPC_READ', readKind: 'tokenBalance' }, base);
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  var M = 'So11111111111111111111111111111111111111112';

  runner.registerStepTests('solanaReadBalances', [
    { name: 'nativeBalance payload', fn: function () {
      var p = buildNativePayload({ cluster: 'mainnet-beta' }, {}, getRowValue);
      runner.assertEqual(p.readKind, 'nativeBalance');
      runner.assertEqual(p.type, 'CFS_SOLANA_RPC_READ');
    }},
    { name: 'tokenBalance payload', fn: function () {
      var p = buildTokenPayload({ mint: M, tokenProgram: 'token', owner: 'X' }, {}, getRowValue);
      runner.assertEqual(p.readKind, 'tokenBalance');
      runner.assertEqual(p.mint, M);
      runner.assertEqual(p.owner, 'X');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
