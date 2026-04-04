/**
 * selectFollowingAccount: tab playback no-op; bind enforced in service worker.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('selectFollowingAccount', [
    { name: 'handler meta: needsElement false, handlesOwnWait', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.selectFollowingAccount;
      runner.assertTrue(!!m, 'meta registered');
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
      runner.assertEqual(m.closeUIAfterRun, false);
    }},
    { name: 'handler resolves (async no-op)', fn: function () {
      var h = global.__CFS_stepHandlers && global.__CFS_stepHandlers.selectFollowingAccount;
      runner.assertTrue(typeof h === 'function');
      var r = h({});
      runner.assertTrue(!!r && typeof r.then === 'function');
      return r.then(function () {
        runner.assertTrue(true);
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
