(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function buildMessage(row, action) {
    var apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    var apiKey = row[apiKeyVar];
    var profileVar = (action.profileUsernameVariableKey || '').trim() || 'profileUsername';
    var profileUsername = row[profileVar];
    return {
      type: 'GET_ANALYTICS',
      apiKey: String(apiKey || '').trim(),
      profileUsername: String(profileUsername || '').trim(),
    };
  }

  runner.registerStepTests('getAnalytics', [
    { name: 'GET_ANALYTICS message shape', fn: function () {
      var m = buildMessage(
        { uploadPostApiKey: 'k', profileUsername: 'u' },
        {}
      );
      runner.assertEqual(m.type, 'GET_ANALYTICS');
      runner.assertEqual(m.apiKey, 'k');
      runner.assertEqual(m.profileUsername, 'u');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
          typeof global.__CFS_stepHandlers.getAnalytics === 'function'
      );
    }},
    { name: 'needsElement false', fn: function () {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.getAnalytics;
      runner.assertEqual(m.needsElement, false);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
