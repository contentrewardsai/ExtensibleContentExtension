/**
 * Unit tests for solanaReadMint
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

  function buildPayload(action, row, getRowValue) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'mintInfo',
      mint: mint,
      tokenProgram: String(action.tokenProgram || 'token').trim(),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim() || undefined,
    };
    if (action.includeMetaplexMetadata === true) payload.includeMetaplexMetadata = true;
    if (action.includeMetaplexMetadata === true && action.fetchMetaplexUriBody === true) {
      payload.fetchMetaplexUriBody = true;
    }
    var ig = resolveTemplate(String(action.metaplexIpfsGateway != null ? action.metaplexIpfsGateway : '').trim(), row, getRowValue).trim();
    if (ig) payload.metaplexIpfsGateway = ig;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  var M = 'So11111111111111111111111111111111111111112';

  runner.registerStepTests('solanaReadMint', [
    { name: 'mintInfo payload', fn: function () {
      var p = buildPayload({ mint: M, tokenProgram: 'token-2022' }, {}, getRowValue);
      runner.assertEqual(p.readKind, 'mintInfo');
      runner.assertEqual(p.mint, M);
      runner.assertEqual(p.tokenProgram, 'token-2022');
      runner.assertEqual(p.includeMetaplexMetadata, undefined);
    }},
    { name: 'mintInfo payload includeMetaplexMetadata', fn: function () {
      var p = buildPayload({ mint: M, includeMetaplexMetadata: true }, {}, getRowValue);
      runner.assertEqual(p.includeMetaplexMetadata, true);
      runner.assertEqual(p.fetchMetaplexUriBody, undefined);
    }},
    { name: 'mintInfo payload fetch uri with include', fn: function () {
      var p = buildPayload({
        mint: M,
        includeMetaplexMetadata: true,
        fetchMetaplexUriBody: true,
        metaplexIpfsGateway: 'https://example.com/ipfs/',
      }, {}, getRowValue);
      runner.assertEqual(p.fetchMetaplexUriBody, true);
      runner.assertEqual(p.metaplexIpfsGateway, 'https://example.com/ipfs/');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
