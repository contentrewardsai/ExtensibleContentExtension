(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getFacebookPages', {
    label: 'Get Facebook Pages',
    defaultAction: { type: 'getFacebookPages', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', profileVariableKey: '', saveAsVariable: 'facebookPages' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Facebook Pages \u2192 ' + saveVar : 'Get Facebook Pages';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'pages' });
      return out;
    },
  });
})();
