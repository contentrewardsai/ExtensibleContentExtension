(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function buildPayload(row, action) {
    var apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    var apiKey = row[apiKeyVar];
    var requestIdVar = (action.requestIdVariableKey || '').trim();
    var requestId = requestIdVar ? row[requestIdVar] : undefined;
    var profileVar = (action.profileUsernameVariableKey || '').trim() || 'profileUsername';
    var profileUsername = row[profileVar];
    var msgPayload = { type: 'GET_POST_ANALYTICS', apiKey: String(apiKey || '').trim() };
    if (requestId) {
      msgPayload.requestId = String(requestId).trim();
    } else {
      msgPayload.profileUsername = String(profileUsername || '').trim();
      var startVar = (action.startDateVariableKey || '').trim();
      if (startVar && row[startVar]) msgPayload.startDate = String(row[startVar]).trim();
      var endVar = (action.endDateVariableKey || '').trim();
      if (endVar && row[endVar]) msgPayload.endDate = String(row[endVar]).trim();
    }
    return msgPayload;
  }

  runner.registerStepTests('getPostAnalytics', [
    { name: 'GET_POST_ANALYTICS with requestId', fn: function () {
      var p = buildPayload(
        { uploadPostApiKey: 'k', req: 'rid-1' },
        { requestIdVariableKey: 'req' }
      );
      runner.assertEqual(p.type, 'GET_POST_ANALYTICS');
      runner.assertEqual(p.requestId, 'rid-1');
      runner.assertTrue(p.profileUsername === undefined);
    }},
    { name: 'GET_POST_ANALYTICS with profile and dates', fn: function () {
      var p = buildPayload(
        { uploadPostApiKey: 'k', profileUsername: 'u', sd: '2024-01-01', ed: '2024-02-01' },
        { startDateVariableKey: 'sd', endDateVariableKey: 'ed' }
      );
      runner.assertEqual(p.profileUsername, 'u');
      runner.assertEqual(p.startDate, '2024-01-01');
      runner.assertEqual(p.endDate, '2024-02-01');
    }},
    { name: 'handler registered', fn: function () {
      runner.assertTrue(typeof global.__CFS_stepHandlers.getPostAnalytics === 'function');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
