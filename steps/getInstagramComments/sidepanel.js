(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getInstagramComments', {
    label: 'Get Instagram Comments',
    defaultAction: { type: 'getInstagramComments', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', mediaIdVariableKey: '', postUrlVariableKey: '', saveAsVariable: 'instagramComments' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Instagram Comments \u2192 ' + saveVar : 'Get Instagram Comments';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'comments' });
      return out;
    },
  });
})();
