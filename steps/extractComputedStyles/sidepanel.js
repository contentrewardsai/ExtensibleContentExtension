(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('extractComputedStyles', {
    getSummary: function(action) {
      return 'Extract styles → ' + (action.saveAsVariable || 'sourceSnapshot');
    },
    getVariableKey: function(action) {
      return action.saveAsVariable || 'sourceSnapshot';
    },
  });
})();
