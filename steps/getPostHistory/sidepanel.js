(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getPostHistory', {
    label: 'Get Post History',
    defaultAction: {
      type: 'getPostHistory',
      runIf: '',
      userVariableKey: '',
      platformVariableKey: '',
      limitVariableKey: '',
      saveAsVariable: 'postHistory',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Post History \u2192 ' + saveVar : 'Get Post History';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'post history array' });
      return out;
    },
  });
})();
