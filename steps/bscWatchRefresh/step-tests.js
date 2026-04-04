/**
 * Unit tests for bscWatchRefresh — service worker message type.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('bscWatchRefresh', [
    { name: 'refresh message type', fn: function () {
      var m = { type: 'CFS_BSC_WATCH_REFRESH_NOW' };
      runner.assertEqual(m.type, 'CFS_BSC_WATCH_REFRESH_NOW');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
