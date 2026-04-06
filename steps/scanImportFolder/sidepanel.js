/**
 * scanImportFolder sidepanel UI binding.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('scanImportFolder', {
    renderForm: function(action, container) {
      // Default form rendering via formSchema in step.json
    },
    readForm: function(container) {
      return {};
    },
    getLabel: function(action) {
      var pid = action.defaultProjectId || action.projectIdVariableKey || 'projectId';
      var poll = (action.pollIntervalMs || 10000) / 1000;
      return 'Scan import folder (project ' + pid + ', every ' + poll + 's)';
    },
  });
})();
