(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getFacebookPages', [
    { name: 'GET_FACEBOOK_PAGES message shape', fn: function () {
      var m = {
        type: 'GET_FACEBOOK_PAGES',
        apiKey: 'key',
        profile: 'p1',
      };
      runner.assertEqual(m.type, 'GET_FACEBOOK_PAGES');
      runner.assertEqual(m.apiKey, 'key');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getFacebookPages === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
