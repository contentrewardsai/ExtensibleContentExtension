/**
 * Unit tests for solanaTransferSpl — payload shape mirrors handler.js.
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

  function buildSplPayload(action, row, getRowValue) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue).trim();
    var toOwner = resolveTemplate(String(action.toOwner != null ? action.toOwner : '').trim(), row, getRowValue).trim();
    if (!toOwner) toOwner = resolveTemplate(String(action.toPubkey || '').trim(), row, getRowValue).trim();
    var amountRaw = resolveTemplate(String(action.amountRaw != null ? action.amountRaw : '').trim(), row, getRowValue).trim();
    var tokenProgram = String(action.tokenProgram || 'token').trim();
    var createDestinationAta = action.createDestinationAta !== false;
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_SOLANA_TRANSFER_SPL',
      mint: mint,
      toOwner: toOwner,
      amountRaw: amountRaw,
      tokenProgram: tokenProgram,
      createDestinationAta: createDestinationAta,
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

  runner.registerStepTests('solanaTransferSpl', [
    { name: 'buildSplPayload type and mint', fn: function () {
      var p = buildSplPayload({
        mint: 'Mint111111111111111111111111111111111111111',
        toOwner: 'To22222222222222222222222222222222222222222',
        amountRaw: '1000',
        tokenProgram: 'token-2022',
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_TRANSFER_SPL');
      runner.assertEqual(p.mint, 'Mint111111111111111111111111111111111111111');
      runner.assertEqual(p.toOwner, 'To22222222222222222222222222222222222222222');
      runner.assertEqual(p.amountRaw, '1000');
      runner.assertEqual(p.tokenProgram, 'token-2022');
      runner.assertEqual(p.createDestinationAta, true);
    }},
    { name: 'buildSplPayload toPubkey fallback', fn: function () {
      var p = buildSplPayload({
        mint: 'M',
        toPubkey: 'FallbackPubkey1111111111111111111111111111111',
        amountRaw: '1',
      }, {}, getRowValue);
      runner.assertEqual(p.toOwner, 'FallbackPubkey1111111111111111111111111111111');
    }},
    { name: 'buildSplPayload createDestinationAta false', fn: function () {
      var p = buildSplPayload({
        mint: 'M', toOwner: 'T', amountRaw: '1', createDestinationAta: false,
      }, {}, getRowValue);
      runner.assertEqual(p.createDestinationAta, false);
    }},
    { name: 'buildSplPayload row templates', fn: function () {
      var row = { m: 'Mx', o: 'Oy', a: '99' };
      var p = buildSplPayload({
        mint: '{{m}}', toOwner: '{{o}}', amountRaw: '{{a}}',
      }, row, getRowValue);
      runner.assertEqual(p.mint, 'Mx');
      runner.assertEqual(p.toOwner, 'Oy');
      runner.assertEqual(p.amountRaw, '99');
    }},
    { name: 'buildSplPayload optional compute budget', fn: function () {
      var p = buildSplPayload({
        mint: 'M', toOwner: 'T', amountRaw: '1',
        computeUnitLimit: '200000',
        computeUnitPriceMicroLamports: '50000',
      }, {}, getRowValue);
      runner.assertEqual(p.computeUnitLimit, '200000');
      runner.assertEqual(p.computeUnitPriceMicroLamports, '50000');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
