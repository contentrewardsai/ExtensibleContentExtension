/**
 * reconcileV3Positions: registration, meta, required ctx, message type.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('reconcileV3Positions', [
    { name: 'handler registered', fn: function () {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.reconcileV3Positions === 'function'
      );
    }},
    { name: 'meta: needsElement false, swTick true', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.reconcileV3Positions;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.swTick, true);
    }},
    { name: 'throws without ctx', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.reconcileV3Positions;
      return h({ workflowId: 'wf-bsc-v3-monitor' }, {}).then(
        function () { throw new Error('expected throw'); },
        function (e) { runner.assertTrue(String(e.message).indexOf('context') >= 0); }
      );
    }},
    { name: 'sends CFS_V3_RECONCILE_POSITIONS', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.reconcileV3Positions;
      var sent;
      var ctx = {
        getRowValue: function (row, key) { return row && row[key]; },
        currentRow: {},
        sendMessage: function (msg) {
          sent = msg;
          return Promise.resolve({ ok: true, untrackedCount: 0, closedCount: 0 });
        },
      };
      return h({ workflowId: 'wf-bsc-v3-monitor', saveResultVariable: 'v3ReconcileResult' }, { ctx: ctx }).then(function () {
        runner.assertEqual(sent.type, 'CFS_V3_RECONCILE_POSITIONS');
        runner.assertEqual(sent.workflowId, 'wf-bsc-v3-monitor');
        runner.assertTrue(String(ctx.currentRow.v3ReconcileResult || '').indexOf('untrackedCount') >= 0);
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
