/**
 * Unit tests for the cryptoSimulateSwap step.
 * Tests local payload construction only — simulations are free but
 * tests should not depend on network/service-worker availability.
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
    var chain = r('chain') || 'solana';
    var runSolana = chain === 'solana' || chain === 'both';
    var runBsc = chain === 'bsc' || chain === 'both';
    var payload = { type: 'CFS_CRYPTO_TEST_SIMULATE', solana: runSolana, bsc: runBsc };
    if (runSolana) {
      var si = r('solInputMint'); if (si) payload.solInputMint = si;
      var so = r('solOutputMint'); if (so) payload.solOutputMint = so;
      var sa = r('solAmount'); if (sa) payload.solAmount = sa;
    }
    if (runBsc) {
      var bi = r('bscTokenIn'); if (bi) payload.bscTokenIn = bi;
      var bo = r('bscTokenOut'); if (bo) payload.bscTokenOut = bo;
      var ba = r('bscAmountIn'); if (ba) payload.bscAmountIn = ba;
    }
    return payload;
  }

  runner.registerStepTests('cryptoSimulateSwap', [
    { name: 'payload has correct message type', fn: function () {
      var p = buildPayload({ chain: 'solana' });
      runner.assertEqual(p.type, 'CFS_CRYPTO_TEST_SIMULATE');
    }},
    { name: 'solana chain enables solana, disables bsc', fn: function () {
      var p = buildPayload({ chain: 'solana' });
      runner.assertEqual(p.solana, true);
      runner.assertEqual(p.bsc, false);
    }},
    { name: 'bsc chain enables bsc, disables solana', fn: function () {
      var p = buildPayload({ chain: 'bsc' });
      runner.assertEqual(p.solana, false);
      runner.assertEqual(p.bsc, true);
    }},
    { name: 'both chain enables both', fn: function () {
      var p = buildPayload({ chain: 'both' });
      runner.assertEqual(p.solana, true);
      runner.assertEqual(p.bsc, true);
    }},
    { name: 'chain defaults to solana', fn: function () {
      var p = buildPayload({});
      runner.assertEqual(p.solana, true);
      runner.assertEqual(p.bsc, false);
    }},
    { name: 'solana mint fields forwarded', fn: function () {
      var p = buildPayload({ chain: 'solana', solInputMint: 'SoMint', solOutputMint: 'UsdcMint', solAmount: '5000000' });
      runner.assertEqual(p.solInputMint, 'SoMint');
      runner.assertEqual(p.solOutputMint, 'UsdcMint');
      runner.assertEqual(p.solAmount, '5000000');
    }},
    { name: 'bsc token fields forwarded', fn: function () {
      var p = buildPayload({ chain: 'bsc', bscTokenIn: '0xWBNB', bscTokenOut: '0xUSDT', bscAmountIn: '1000' });
      runner.assertEqual(p.bscTokenIn, '0xWBNB');
      runner.assertEqual(p.bscTokenOut, '0xUSDT');
      runner.assertEqual(p.bscAmountIn, '1000');
    }},
    { name: 'template resolution in row values', fn: function () {
      var row = { mint: 'Resolved' };
      var p = buildPayload({ chain: 'solana', solInputMint: '{{mint}}' }, row);
      runner.assertEqual(p.solInputMint, 'Resolved');
    }},
    { name: 'omitted sol fields excluded from payload', fn: function () {
      var p = buildPayload({ chain: 'solana' });
      runner.assertEqual(p.solInputMint, undefined);
      runner.assertEqual(p.solOutputMint, undefined);
    }},
    { name: 'bsc fields excluded when chain is solana', fn: function () {
      var p = buildPayload({ chain: 'solana', bscTokenIn: '0xWBNB' });
      runner.assertEqual(p.bscTokenIn, undefined);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
