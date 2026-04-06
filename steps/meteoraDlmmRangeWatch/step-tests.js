/**
 * meteoraDlmmRangeWatch: poll interval clamping, direction logic, required-field checks.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function clampPoll(v) { return Math.max(5000, parseInt(v, 10) || 30000); }
  function clampTimeout(v) { return Math.max(0, parseInt(v, 10) || 0); }
  function driftDirection(activeBinId, upperBinId) {
    return activeBinId > upperBinId ? 'above' : 'below';
  }

  runner.registerStepTests('meteoraDlmmRangeWatch', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.meteoraDlmmRangeWatch === 'function'
      );
    }},
    { name: 'meta: needsElement false, handlesOwnWait true', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.meteoraDlmmRangeWatch;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.meteoraDlmmRangeWatch;
      return h({ lbPair: 'x', position: 'y' }, {}).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('context') >= 0); }
      );
    }},
    { name: 'throws without lbPair', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.meteoraDlmmRangeWatch;
      return h({ position: 'y' }, { ctx: { getRowValue: getRowValue, currentRow: {}, sendMessage: function(){}, sleep: function(){} } }).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('lbPair') >= 0); }
      );
    }},
    { name: 'throws without position', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.meteoraDlmmRangeWatch;
      return h({ lbPair: 'abc' }, { ctx: { getRowValue: getRowValue, currentRow: {}, sendMessage: function(){}, sleep: function(){} } }).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('position') >= 0); }
      );
    }},
    { name: 'poll interval clamp to minimum 5000', fn: function () {
      runner.assertEqual(clampPoll(1000), 5000);
      runner.assertEqual(clampPoll(0), 30000);
      runner.assertEqual(clampPoll(60000), 60000);
    }},
    { name: 'poll interval default 30000', fn: function () {
      runner.assertEqual(clampPoll(undefined), 30000);
      runner.assertEqual(clampPoll(null), 30000);
    }},
    { name: 'timeout clamp non-negative', fn: function () {
      runner.assertEqual(clampTimeout(-1), 0);
      runner.assertEqual(clampTimeout(0), 0);
      runner.assertEqual(clampTimeout(120000), 120000);
    }},
    { name: 'drift direction above when activeBin > upper', fn: function () {
      runner.assertEqual(driftDirection(110, 100), 'above');
    }},
    { name: 'drift direction below when activeBin <= upper', fn: function () {
      runner.assertEqual(driftDirection(40, 100), 'below');
      runner.assertEqual(driftDirection(100, 100), 'below');
    }},
    { name: 'message type is CFS_METEORA_DLMM_RANGE_CHECK', fn: function () {
      runner.assertEqual('CFS_METEORA_DLMM_RANGE_CHECK', 'CFS_METEORA_DLMM_RANGE_CHECK');
    }},
    { name: 'template resolution for lbPair', fn: function () {
      var row = { pool: 'PoolPubkey123' };
      var resolved = '{{pool}}'.replace(/\{\{([^}]+)\}\}/g, function (_, k) { return getRowValue(row, k.trim()) || ''; });
      runner.assertEqual(resolved, 'PoolPubkey123');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
