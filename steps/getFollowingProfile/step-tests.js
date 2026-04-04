(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getFollowingProfile', [
    { name: 'GET_FOLLOWING_DATA single by profileId', fn: function () {
      var p = { type: 'GET_FOLLOWING_DATA', profileId: 'uuid' };
      runner.assertEqual(p.type, 'GET_FOLLOWING_DATA');
      runner.assertEqual(p.profileId, 'uuid');
    }},
    { name: 'GET_FOLLOWING_DATA by profileName', fn: function () {
      var p = { type: 'GET_FOLLOWING_DATA', profileName: 'Bob' };
      runner.assertEqual(p.profileName, 'Bob');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getFollowingProfile === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
