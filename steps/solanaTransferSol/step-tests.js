/**
 * Unit tests for solanaTransferSol — payload shape mirrors handler.js.
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

  function buildTransferSolPayload(action, row, getRowValue) {
    var toPubkey = resolveTemplate(String(action.toPubkey || '').trim(), row, getRowValue).trim();
    var lamports = resolveTemplate(String(action.lamports != null ? action.lamports : '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_SOLANA_TRANSFER_SOL',
      toPubkey: toPubkey,
      lamports: lamports,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    var cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  runner.registerStepTests('solanaTransferSol', [
    { name: 'buildTransferSolPayload core fields', fn: function () {
      var p = buildTransferSolPayload({
        toPubkey: 'Dest1111111111111111111111111111111111111111',
        lamports: '5000',
        cluster: 'devnet',
        skipPreflight: true,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_TRANSFER_SOL');
      runner.assertEqual(p.toPubkey, 'Dest1111111111111111111111111111111111111111');
      runner.assertEqual(p.lamports, '5000');
      runner.assertEqual(p.cluster, 'devnet');
      runner.assertEqual(p.skipPreflight, true);
    }},
    { name: 'buildTransferSolPayload row templates', fn: function () {
      var row = { d: 'Dx', l: '42' };
      var p = buildTransferSolPayload({ toPubkey: '{{d}}', lamports: '{{l}}' }, row, getRowValue);
      runner.assertEqual(p.toPubkey, 'Dx');
      runner.assertEqual(p.lamports, '42');
    }},
    { name: 'buildTransferSolPayload optional compute budget', fn: function () {
      var p = buildTransferSolPayload({
        toPubkey: 'D',
        lamports: '1',
        computeUnitLimit: '200000',
        computeUnitPriceMicroLamports: '50000',
      }, {}, getRowValue);
      runner.assertEqual(p.computeUnitLimit, '200000');
      runner.assertEqual(p.computeUnitPriceMicroLamports, '50000');
    }},
    { name: 'buildTransferSolPayload missing toPubkey yields empty string', fn: function () {
      var p = buildTransferSolPayload({ lamports: '1' }, {}, getRowValue);
      runner.assertEqual(p.toPubkey, '');
      runner.assertEqual(p.type, 'CFS_SOLANA_TRANSFER_SOL');
    }},
    { name: 'buildTransferSolPayload missing lamports yields empty string', fn: function () {
      var p = buildTransferSolPayload({ toPubkey: 'Dest' }, {}, getRowValue);
      runner.assertEqual(p.lamports, '');
    }},
    { name: 'buildTransferSolPayload defaults cluster to mainnet-beta', fn: function () {
      var p = buildTransferSolPayload({ toPubkey: 'D', lamports: '1' }, {}, getRowValue);
      runner.assertEqual(p.cluster, 'mainnet-beta');
    }},
    { name: 'buildTransferSolPayload omits compute budget when empty', fn: function () {
      var p = buildTransferSolPayload({ toPubkey: 'D', lamports: '1' }, {}, getRowValue);
      runner.assertEqual(p.computeUnitLimit, undefined);
      runner.assertEqual(p.computeUnitPriceMicroLamports, undefined);
    }},
    { name: 'buildTransferSolPayload skipSimulation defaults false', fn: function () {
      var p = buildTransferSolPayload({ toPubkey: 'D', lamports: '1' }, {}, getRowValue);
      runner.assertEqual(p.skipSimulation, false);
      runner.assertEqual(p.skipPreflight, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
