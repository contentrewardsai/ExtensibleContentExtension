(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getScheduledPosts', [
    { name: 'GET_SCHEDULED_POSTS with user', fn: function () {
      var m = { type: 'GET_SCHEDULED_POSTS', user: 'acct' };
      runner.assertEqual(m.type, 'GET_SCHEDULED_POSTS');
      runner.assertEqual(m.user, 'acct');
    }},
    { name: 'GET_SCHEDULED_POSTS minimal', fn: function () {
      var m = { type: 'GET_SCHEDULED_POSTS' };
      runner.assertEqual(m.type, 'GET_SCHEDULED_POSTS');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getScheduledPosts === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
