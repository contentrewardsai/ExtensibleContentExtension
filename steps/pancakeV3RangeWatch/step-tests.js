/**
 * pancakeV3RangeWatch: poll interval clamping, one-shot vs wait, required-field checks.
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
  function driftDirection(currentTick, tickUpper) {
    return currentTick > tickUpper ? 'above' : 'below';
  }

  function mockCtx(row, response) {
    return {
      getRowValue: getRowValue,
      currentRow: row,
      sendMessage: function () { return Promise.resolve(response); },
      sleep: function () { return Promise.resolve(); },
    };
  }

  runner.registerStepTests('pancakeV3RangeWatch', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.pancakeV3RangeWatch === 'function'
      );
    }},
    { name: 'meta: needsElement false, handlesOwnWait true, swTick true', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.pancakeV3RangeWatch;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
      runner.assertEqual(m.swTick, true);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeV3RangeWatch;
      return h({ v3PositionTokenId: '123' }, {}).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('context') >= 0); }
      );
    }},
    { name: 'throws without v3PositionTokenId', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeV3RangeWatch;
      return h({}, { ctx: { getRowValue: getRowValue, currentRow: {}, sendMessage: function(){}, sleep: function(){} } }).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('v3PositionTokenId') >= 0); }
      );
    }},
    { name: 'one-shot succeeds in-range and sets triggerReason', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeV3RangeWatch;
      var row = {};
      return h(
        { v3PositionTokenId: '42', waitUntilOutOfRange: false, saveDriftDirection: 'driftDirection' },
        { ctx: mockCtx(row, { ok: true, inRange: true, currentTick: 100, tickLower: 90, tickUpper: 110, pool: '0xpool' }) }
      ).then(function () {
        runner.assertEqual(row.inRange, 'true');
        runner.assertEqual(row.triggerReason, 'in_range');
        runner.assertEqual(row.driftDirection, '');
      });
    }},
    { name: 'one-shot hard OOR sets below', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeV3RangeWatch;
      var row = {};
      return h(
        { v3PositionTokenId: '42', waitUntilOutOfRange: false },
        { ctx: mockCtx(row, { ok: true, inRange: false, currentTick: 80, tickLower: 90, tickUpper: 110 }) }
      ).then(function () {
        runner.assertEqual(row.inRange, 'false');
        runner.assertEqual(row.triggerReason, 'hard_oor');
        runner.assertEqual(row.driftDirection, 'below');
      });
    }},
    { name: 'one-shot near-edge sets triggerReason', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.pancakeV3RangeWatch;
      var row = { nearEdgePercent: '2' };
      return h(
        { v3PositionTokenId: '42', waitUntilOutOfRange: false, nearEdgePercent: '2' },
        { ctx: mockCtx(row, { ok: true, inRange: true, currentTick: 100, tickLower: 90, tickUpper: 110, pctToLower: 1.5, pctToUpper: 10 }) }
      ).then(function () {
        runner.assertEqual(row.triggerReason, 'near_edge');
        runner.assertEqual(row.driftDirection, 'below');
        runner.assertEqual(row.inRange, 'true');
      });
    }},
    { name: 'poll interval clamp to minimum 5000', fn: function () {
      runner.assertEqual(clampPoll(1000), 5000);
      runner.assertEqual(clampPoll(0), 30000);
      runner.assertEqual(clampPoll(60000), 60000);
    }},
    { name: 'poll interval default 30000', fn: function () {
      runner.assertEqual(clampPoll(undefined), 30000);
    }},
    { name: 'timeout default 0 (unlimited)', fn: function () {
      runner.assertEqual(clampTimeout(undefined), 0);
      runner.assertEqual(clampTimeout(null), 0);
    }},
    { name: 'drift direction above when tick > upper', fn: function () {
      runner.assertEqual(driftDirection(50100, 50000), 'above');
    }},
    { name: 'drift direction below when tick <= upper', fn: function () {
      runner.assertEqual(driftDirection(49000, 50000), 'below');
      runner.assertEqual(driftDirection(50000, 50000), 'below');
    }},
    { name: 'message type is CFS_BSC_V3_RANGE_CHECK', fn: function () {
      runner.assertEqual('CFS_BSC_V3_RANGE_CHECK', 'CFS_BSC_V3_RANGE_CHECK');
    }},
    { name: 'template resolution for v3PositionTokenId', fn: function () {
      var row = { posId: '42' };
      var resolved = '{{posId}}'.replace(/\{\{([^}]+)\}\}/g, function (_, k) { return getRowValue(row, k.trim()) || ''; });
      runner.assertEqual(resolved, '42');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
