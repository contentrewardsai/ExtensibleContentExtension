(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('replyInstagramComment', {
    label: 'Reply Instagram Comment',
    defaultAction: { type: 'replyInstagramComment', runIf: '', apiKeyVariableKey: 'uploadPostApiKey', commentIdVariableKey: 'commentId', messageVariableKey: 'message', saveAsVariable: 'replyResult' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Reply IG Comment \u2192 ' + saveVar : 'Reply IG Comment';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'reply result' });
      return out;
    },
  });
})();
