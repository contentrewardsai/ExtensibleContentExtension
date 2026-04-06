(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('goBack', {
    label: 'Go back',
    defaultAction: { type: 'goBack' },
    getSummary: function(_action) {
      return 'Go back one page';
    },
    handlesOwnWait: true,
  });
})();
