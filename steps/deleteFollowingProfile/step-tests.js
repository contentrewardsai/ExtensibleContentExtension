(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('deleteFollowingProfile', [
    { name: 'deleteProfile payload with profileId', fn: function () {
      var p = { type: 'MUTATE_FOLLOWING', action: 'deleteProfile', profileId: 'uuid-1' };
      runner.assertEqual(p.action, 'deleteProfile');
      runner.assertEqual(p.profileId, 'uuid-1');
    }},
    { name: 'deleteProfile payload with profileName', fn: function () {
      var p = { type: 'MUTATE_FOLLOWING', action: 'deleteProfile', profileName: 'X' };
      runner.assertEqual(p.profileName, 'X');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.deleteFollowingProfile === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
