(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('sendInstagramDm', {
    label: 'Send Instagram DM',
    defaultAction: { type: 'sendInstagramDm', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', recipientIdVariableKey: 'recipientId', messageVariableKey: 'message', saveAsVariable: 'dmResult' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Send IG DM \u2192 ' + saveVar : 'Send IG DM';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'DM result' });
      return out;
    },
  });
})();
