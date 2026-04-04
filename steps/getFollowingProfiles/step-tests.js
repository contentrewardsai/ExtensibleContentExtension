(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getFollowingProfiles', [
    { name: 'GET_FOLLOWING_DATA list message', fn: function () {
      var m = { type: 'GET_FOLLOWING_DATA', nameFilter: 'alice' };
      runner.assertEqual(m.type, 'GET_FOLLOWING_DATA');
      runner.assertEqual(m.nameFilter, 'alice');
    }},
    { name: 'GET_FOLLOWING_DATA omits empty nameFilter', fn: function () {
      var nameFilter = '';
      var m = { type: 'GET_FOLLOWING_DATA', nameFilter: nameFilter ? String(nameFilter).trim() : undefined };
      runner.assertTrue(m.nameFilter === undefined);
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getFollowingProfiles === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
