/**
 * detectMediaType sidepanel UI binding.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('detectMediaType', {
    getLabel: function(action) {
      return 'Detect media type → ' + (action.saveTypeVariable || 'mediaType');
    },
  });
})();
