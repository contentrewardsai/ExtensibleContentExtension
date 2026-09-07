(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('runWorkflowPlan', {
    getSummary: function(action) {
      return 'Run workflow plan (' + (action.variableKey || 'inline') + ')';
    },
  });
})();
