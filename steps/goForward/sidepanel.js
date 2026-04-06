(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('goForward', {
    label: 'Go forward',
    defaultAction: { type: 'goForward' },
    getSummary: function(_action) {
      return 'Go forward one page';
    },
    handlesOwnWait: true,
  });
})();
