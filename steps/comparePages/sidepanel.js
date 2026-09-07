(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('comparePages', {
    getSummary: function() { return 'Compare source vs preview'; },
    getVariableKey: function(action) { return action.saveAsVariable || 'compare'; },
  });
})();
