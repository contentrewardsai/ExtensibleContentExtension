/**
 * Unit tests for solanaEnsureTokenAccount — payload shape mirrors handler.js
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

  function parseExtraMintLines(resolved) {
    if (!resolved || typeof resolved !== 'string') return [];
    var out = [];
    var seen = {};
    resolved.split(/\r?\n/).forEach(function (line) {
      line.split(',').forEach(function (part) {
        var m = part.trim();
        if (!m || Object.prototype.hasOwnProperty.call(seen, m)) return;
        seen[m] = true;
        out.push(m);
      });
    });
    return out;
  }

  function mintSequence(primary, extras) {
    var seen = {};
    var list = [];
    function add(m) {
      var t = String(m || '').trim();
      if (!t || Object.prototype.hasOwnProperty.call(seen, t)) return;
      seen[t] = true;
      list.push(t);
    }
    add(primary);
    extras.forEach(function (m) { add(m); });
    return list;
  }

  function buildPayload(action, row, getRowValue) {
    var mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue).trim();
    var tokenProgram = String(action.tokenProgram || 'token').trim();
    var owner = resolveTemplate(String(action.owner || '').trim(), row, getRowValue).trim();
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue).trim();
    var payload = {
      type: 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT',
      mint: mint,
      tokenProgram: tokenProgram,
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    if (owner) payload.owner = owner;
    var cuLim = resolveTemplate(String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim(), row, getRowValue).trim();
    var cuPrice = resolveTemplate(String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim(), row, getRowValue).trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  var MINT = 'So11111111111111111111111111111111111111112';

  runner.registerStepTests('solanaEnsureTokenAccount', [
    { name: 'buildPayload core', fn: function () {
      var p = buildPayload({
        mint: MINT,
        tokenProgram: 'token-2022',
        cluster: 'devnet',
        skipSimulation: true,
      }, {}, getRowValue);
      runner.assertEqual(p.type, 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT');
      runner.assertEqual(p.mint, MINT);
      runner.assertEqual(p.tokenProgram, 'token-2022');
      runner.assertEqual(p.cluster, 'devnet');
      runner.assertEqual(p.skipSimulation, true);
      runner.assertEqual(p.owner, undefined);
    }},
    { name: 'buildPayload owner', fn: function () {
      var p = buildPayload({ mint: MINT, owner: 'Own111111111111111111111111111111111111111' }, {}, getRowValue);
      runner.assertEqual(p.owner, 'Own111111111111111111111111111111111111111');
    }},
    { name: 'mintSequence dedupes primary in extras', fn: function () {
      var M2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      var seq = mintSequence(MINT, parseExtraMintLines(MINT + '\n' + M2));
      runner.assertEqual(seq.length, 2);
      runner.assertEqual(seq[0], MINT);
      runner.assertEqual(seq[1], M2);
    }},
    { name: 'parseExtraMintLines comma and newline', fn: function () {
      var a = parseExtraMintLines('  x  ,\ny\n');
      runner.assertEqual(a.length, 2);
      runner.assertEqual(a[0], 'x');
      runner.assertEqual(a[1], 'y');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
