/**
 * pancakeInfiBinRangeWatch: poll interval clamping, direction logic, required-field checks.
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
  function driftDirection(activeId, upperBinId) {
    return activeId > upperBinId ? 'above' : 'below';
  }
  function inRange(activeId, lower, upper) {
    return activeId >= lower && activeId <= upper;
  }

  runner.registerStepTests('pancakeInfiBinRangeWatch', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.pancakeInfiBinRangeWatch === 'function'
      );
    }},
    { name: 'meta: needsElement false, handlesOwnWait true', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.pancakeInfiBinRangeWatch;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeInfiBinRangeWatch;
      return h({ infiPositionTokenId: '1' }, {}).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('context') >= 0); }
      );
    }},
    { name: 'throws without position or range', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeInfiBinRangeWatch;
      return h({}, { ctx: { getRowValue: getRowValue, currentRow: {}, sendMessage: function(){}, sleep: function(){} } }).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('infiPositionTokenId') >= 0); }
      );
    }},
    { name: 'poll interval clamp to minimum 5000', fn: function () {
      runner.assertEqual(clampPoll(1000), 5000);
      runner.assertEqual(clampPoll(0), 30000);
      runner.assertEqual(clampPoll(60000), 60000);
    }},
    { name: 'drift direction above when activeId > upper', fn: function () {
      runner.assertEqual(driftDirection(8388620, 8388610), 'above');
    }},
    { name: 'drift direction below when activeId < lower', fn: function () {
      runner.assertEqual(driftDirection(8388590, 8388610), 'below');
    }},
    { name: 'inRange true inside bounds', fn: function () {
      runner.assertTrue(inRange(8388605, 8388600, 8388610));
    }},
    { name: 'inRange false outside bounds', fn: function () {
      runner.assertFalse(inRange(8388620, 8388600, 8388610));
    }},
    { name: 'message type is CFS_BSC_INFI_BIN_RANGE_CHECK', fn: function () {
      runner.assertEqual('CFS_BSC_INFI_BIN_RANGE_CHECK', 'CFS_BSC_INFI_BIN_RANGE_CHECK');
    }},
    { name: 'template resolution for infiPositionTokenId', fn: function () {
      var row = { positionNftId: '99' };
      var resolved = '{{positionNftId}}'.replace(/\{\{([^}]+)\}\}/g, function (_, k) { return getRowValue(row, k.trim()) || ''; });
      runner.assertEqual(resolved, '99');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
