(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getLinkedInPages', {
    label: 'Get LinkedIn Pages',
    defaultAction: { type: 'getLinkedInPages', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', profileVariableKey: '', saveAsVariable: 'linkedinPages' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get LinkedIn Pages \u2192 ' + saveVar : 'Get LinkedIn Pages';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'pages' });
      return out;
    },
  });
})();
