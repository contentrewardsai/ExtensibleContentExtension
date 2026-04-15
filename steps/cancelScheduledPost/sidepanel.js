(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('cancelScheduledPost', {
    label: 'Cancel Scheduled Post',
    defaultAction: {
      type: 'cancelScheduledPost',
      runIf: '',
      jobIdVariableKey: 'jobId',
      saveAsVariable: 'cancelResult',
    },
    getSummary: function(action) {
      var jobVar = (action.jobIdVariableKey || '').trim();
      return jobVar ? 'Cancel Scheduled Post (' + jobVar + ')' : 'Cancel Scheduled Post';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'cancel result' });
      return out;
    },
  });
})();
