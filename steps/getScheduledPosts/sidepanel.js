(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getScheduledPosts', {
    label: 'Get Scheduled Posts',
    defaultAction: {
      type: 'getScheduledPosts',
      runIf: '',
      userVariableKey: '',
      saveAsVariable: 'scheduledPosts',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Scheduled Posts \u2192 ' + saveVar : 'Get Scheduled Posts';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'scheduled posts array' });
      return out;
    },
  });
})();
