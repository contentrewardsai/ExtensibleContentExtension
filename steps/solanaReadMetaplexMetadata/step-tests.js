/**
 * Unit tests for solanaReadMetaplexMetadata — payload shape mirrors handler.js
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
      readKind: 'metaplexMetadata',
      mint: mint,
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim() || undefined,
    };
    if (action.fetchMetaplexUriBody === true) payload.fetchMetaplexUriBody = true;
    var ig = resolveTemplate(String(action.metaplexIpfsGateway || '').trim(), row, getRowValue).trim();
    if (ig) payload.metaplexIpfsGateway = ig;
    var ing = resolveTemplate(String(action.metaplexIpnsGateway || '').trim(), row, getRowValue).trim();
    if (ing) payload.metaplexIpnsGateway = ing;
    var arw = resolveTemplate(String(action.metaplexArweaveGateway || '').trim(), row, getRowValue).trim();
    if (arw) payload.metaplexArweaveGateway = arw;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  var M = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  runner.registerStepTests('solanaReadMetaplexMetadata', [
    { name: 'metaplexMetadata payload', fn: function () {
      var p = buildPayload({ mint: M, cluster: 'devnet' }, {}, getRowValue);
      runner.assertEqual(p.readKind, 'metaplexMetadata');
      runner.assertEqual(p.mint, M);
      runner.assertEqual(p.cluster, 'devnet');
      runner.assertEqual(p.fetchMetaplexUriBody, undefined);
    }},
    { name: 'metaplexMetadata payload fetch uri', fn: function () {
      var p = buildPayload({ mint: M, fetchMetaplexUriBody: true }, {}, getRowValue);
      runner.assertEqual(p.fetchMetaplexUriBody, true);
    }},
    { name: 'metaplexMetadata payload ipfs gateway', fn: function () {
      var p = buildPayload({
        mint: M,
        fetchMetaplexUriBody: true,
        metaplexIpfsGateway: 'https://nftstorage.link/ipfs/',
      }, {}, getRowValue);
      runner.assertEqual(p.metaplexIpfsGateway, 'https://nftstorage.link/ipfs/');
    }},
    { name: 'metaplexMetadata payload arweave gateway', fn: function () {
      var p = buildPayload({
        mint: M,
        fetchMetaplexUriBody: true,
        metaplexArweaveGateway: 'https://ar-io.net/',
      }, {}, getRowValue);
      runner.assertEqual(p.metaplexArweaveGateway, 'https://ar-io.net/');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
