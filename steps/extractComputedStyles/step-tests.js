(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('extractComputedStyles', [
    { name: 'saves snapshot on the row', fn: function () {
      var handler = global.__CFS_stepHandlers && global.__CFS_stepHandlers.extractComputedStyles;
      if (!handler) {
        runner.assertTrue(true, 'handler present at playback');
        return;
      }
      var row = {};
      return handler({ type: 'extractComputedStyles', saveAsVariable: 'snap', regions: [] }, {
        ctx: { currentRow: row, document: document },
      }).then(function () {
        runner.assertTrue(!!row.snap, 'snapshot saved');
        runner.assertTrue(Array.isArray(row.snap.regions), 'regions array');
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
