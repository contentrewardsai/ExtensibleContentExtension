/**
 * checkRealtimeData: tab playback reads latest snapshot; no second poller.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('checkRealtimeData', [
    { name: 'handler meta: needsElement false, handlesOwnWait', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.checkRealtimeData;
      runner.assertTrue(!!m, 'meta registered');
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
      runner.assertEqual(m.closeUIAfterRun, false);
    }},
    { name: 'handler resolves without snapshot (empty success)', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.checkRealtimeData;
      runner.assertTrue(typeof h === 'function');
      var row = {};
      var r = h(
        { type: 'checkRealtimeData', followingSolanaWatch: true, saveResultVariable: 'snap' },
        { ctx: { currentRow: row } },
      );
      runner.assertTrue(!!r && typeof r.then === 'function');
      return r.then(function () {
        runner.assertTrue(typeof row.snap === 'string' || row.snap === undefined || row.snap === '');
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
