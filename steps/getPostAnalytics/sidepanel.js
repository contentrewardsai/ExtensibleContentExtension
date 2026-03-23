(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getPostAnalytics', {
    label: 'Get Post Analytics',
    defaultAction: { type: 'getPostAnalytics', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', profileUsernameVariableKey: 'profileUsername', requestIdVariableKey: '', startDateVariableKey: '', endDateVariableKey: '', saveAsVariable: 'postAnalytics' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Post Analytics \u2192 ' + saveVar : 'Get Post Analytics';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'analytics' });
      return out;
    },
  });
})();
