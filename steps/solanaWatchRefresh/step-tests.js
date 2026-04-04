/**
 * Unit tests for solanaWatchRefresh — message passes skipJitter.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function buildRefreshMessage(action) {
    var skipJitter = action.skipJitter === true;
    return { type: 'CFS_SOLANA_WATCH_REFRESH_NOW', skipJitter: skipJitter };
  }

  runner.registerStepTests('solanaWatchRefresh', [
    { name: 'message type', fn: function () {
      var m = buildRefreshMessage({});
      runner.assertEqual(m.type, 'CFS_SOLANA_WATCH_REFRESH_NOW');
      runner.assertEqual(m.skipJitter, false);
    }},
    { name: 'skipJitter true', fn: function () {
      var m = buildRefreshMessage({ skipJitter: true });
      runner.assertEqual(m.skipJitter, true);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
