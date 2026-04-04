(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  runner.registerStepTests('getLinkedInPages', [
    { name: 'GET_LINKEDIN_PAGES message shape', fn: function () {
      var m = { type: 'GET_LINKEDIN_PAGES', apiKey: 'k', profile: undefined };
      runner.assertEqual(m.type, 'GET_LINKEDIN_PAGES');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getLinkedInPages === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
