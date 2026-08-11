/**
 * Unit tests for bscV3RebalanceOnce — extractPlan message order.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function extractPlan(action) {
    var plan = [];
    plan.push({ type: 'CFS_BSC_POOL_EXECUTE', operation: 'v3PositionDecreaseLiquidity' });
    plan.push({ type: 'CFS_BSC_POOL_EXECUTE', operation: 'v3PositionCollect' });
    if (action.burnPosition !== false) {
      plan.push({ type: 'CFS_BSC_POOL_EXECUTE', operation: 'v3PositionBurn' });
    }
    plan.push({ type: 'CFS_BSC_QUERY', operation: 'v3RestakeRange' });
    plan.push({ type: 'CFS_BSC_QUERY', operation: 'v3LpAmountsFromBnb' });
    if (action.ensureApprovals !== false) {
      plan.push({ marker: 'ensureApprovals' });
    }
    plan.push({ type: 'CFS_BSC_POOL_EXECUTE', operation: 'v3PositionMint' });
    return plan;
  }

  function operationSequence(plan) {
    return plan.map(function(p) { return p.operation || p.marker; }).filter(Boolean);
  }

  runner.registerStepTests('bscV3RebalanceOnce', [
    { name: 'handler registered', fn: function() {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.bscV3RebalanceOnce === 'function'
      );
    }},
    { name: 'meta: needsElement false, handlesOwnWait true', fn: function() {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.bscV3RebalanceOnce;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
    }},
    { name: 'extractPlan order: decrease, collect, restakeRange, mint', fn: function() {
      var seq = operationSequence(extractPlan({ burnPosition: false, ensureApprovals: false }));
      runner.assertEqual(seq[0], 'v3PositionDecreaseLiquidity');
      runner.assertEqual(seq[1], 'v3PositionCollect');
      runner.assertEqual(seq[2], 'v3RestakeRange');
      runner.assertEqual(seq[3], 'v3LpAmountsFromBnb');
      runner.assertEqual(seq[seq.length - 1], 'v3PositionMint');
    }},
    { name: 'extractPlan includes burn when enabled', fn: function() {
      var seq = operationSequence(extractPlan({ burnPosition: true, ensureApprovals: false }));
      runner.assertEqual(seq.indexOf('v3PositionBurn'), 2);
    }},
    { name: 'extractPlan includes ensureApprovals before mint', fn: function() {
      var plan = extractPlan({ burnPosition: false, ensureApprovals: true });
      var seq = operationSequence(plan);
      runner.assertTrue(seq.indexOf('ensureApprovals') >= 0);
      runner.assertTrue(seq.indexOf('ensureApprovals') < seq.indexOf('v3PositionMint'));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
