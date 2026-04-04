/**
 * Unit tests for meteoraCpammClaimFees — sendMessage payload mirrors handler.js.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function buildPayload(action) {
    var cluster = String(action.cluster || 'mainnet-beta').trim();
    var rpcUrl = String(action.rpcUrl || '').trim();
    var payload = {
      type: 'CFS_METEORA_CPAMM_CLAIM_FEES',
      position: String(action.position || '').trim(),
      cluster: cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
    var pool = String(action.pool || '').trim();
    if (pool) payload.pool = pool;
    var cuLim = String(action.computeUnitLimit != null ? action.computeUnitLimit : '').trim();
    var cuPrice = String(action.computeUnitPriceMicroLamports != null ? action.computeUnitPriceMicroLamports : '').trim();
    if (cuLim) payload.computeUnitLimit = cuLim;
    if (cuPrice) payload.computeUnitPriceMicroLamports = cuPrice;
    return payload;
  }

  runner.registerStepTests('meteoraCpammClaimFees', [
    { name: 'payload type', fn: function() {
      var p = buildPayload({ position: 'Pos111111111111111111111111111111111111111' });
      runner.assertEqual(p.type, 'CFS_METEORA_CPAMM_CLAIM_FEES');
      runner.assertEqual(p.position, 'Pos111111111111111111111111111111111111111');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
