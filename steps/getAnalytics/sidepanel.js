(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getAnalytics', {
    label: 'Get Analytics',
    defaultAction: { type: 'getAnalytics', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', profileUsernameVariableKey: 'profileUsername', saveAsVariable: 'analytics' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Analytics \u2192 ' + saveVar : 'Get Analytics';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'analytics' });
      return out;
    },
  });
})();
