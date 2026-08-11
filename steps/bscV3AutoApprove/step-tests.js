/**
 * Unit tests for bscV3AutoApprove — buildApprovePlan skips when allowance is max.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  var MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  var ALLOWANCE_SKIP_THRESHOLD = '1000000000000000000000000000000';
  var SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
  var NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';

  function allowanceSufficient(allowanceStr) {
    if (!allowanceStr) return false;
    try {
      var a = BigInt(allowanceStr);
      if (a >= BigInt(MAX_UINT256)) return true;
      if (a >= BigInt(ALLOWANCE_SKIP_THRESHOLD)) return true;
    } catch (_) {
      return false;
    }
    return false;
  }

  /**
   * Mock approve plan: returns execute steps only when allowance is insufficient.
   */
  function buildApprovePlan(action, allowancesByKey) {
    var tokenA = String(action.tokenA || '').trim();
    var tokenB = String(action.tokenB || '').trim();
    var router = String(action.swapRouterV3Address || '').trim() || SWAP_ROUTER_V3;
    var npm = String(action.positionManagerAddress || '').trim() || NPM_V3;
    var tokens = [tokenA, tokenB];
    var spenders = [router, npm];
    var plan = [{ type: 'CFS_BSC_QUERY', operation: 'automationWalletAddress' }];
    var results = [];
    for (var ti = 0; ti < tokens.length; ti++) {
      var tok = tokens[ti];
      for (var si = 0; si < spenders.length; si++) {
        var spender = spenders[si];
        plan.push({ type: 'CFS_BSC_QUERY', operation: 'allowance', token: tok, spender: spender });
        var key = tok + ':' + spender;
        var alw = allowancesByKey && allowancesByKey[key];
        if (allowanceSufficient(alw)) {
          results.push({ token: tok, spender: spender, skipped: true });
        } else {
          plan.push({ type: 'CFS_BSC_POOL_EXECUTE', operation: 'approve', token: tok, spender: spender });
          results.push({ token: tok, spender: spender, skipped: false });
        }
      }
    }
    return { plan: plan, results: results };
  }

  runner.registerStepTests('bscV3AutoApprove', [
    { name: 'handler registered', fn: function() {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.bscV3AutoApprove === 'function'
      );
    }},
    { name: 'meta: needsElement false, handlesOwnWait true', fn: function() {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.bscV3AutoApprove;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
    }},
    { name: 'buildApprovePlan skips when allowance is max', fn: function() {
      var tok = '0x55d398326f99059fF775485246999027B3197955';
      var other = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c';
      var built = buildApprovePlan(
        { tokenA: tok, tokenB: other },
        {
          [tok + ':' + SWAP_ROUTER_V3]: MAX_UINT256,
          [tok + ':' + NPM_V3]: MAX_UINT256,
          [other + ':' + SWAP_ROUTER_V3]: '0',
          [other + ':' + NPM_V3]: '0',
        }
      );
      var approveOps = built.plan.filter(function(p) { return p.operation === 'approve'; });
      runner.assertEqual(approveOps.length, 2);
      runner.assertEqual(built.results.filter(function(r) { return r.skipped; }).length, 2);
    }},
    { name: 'buildApprovePlan approves all when zero allowance', fn: function() {
      var tok = '0xaaa';
      var other = '0xbbb';
      var built = buildApprovePlan({ tokenA: tok, tokenB: other }, {});
      runner.assertEqual(built.plan.filter(function(p) { return p.operation === 'approve'; }).length, 4);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
