/**
 * moveProjectFile sidepanel UI binding.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('moveProjectFile', {
    getLabel: function(action) {
      var src = action.sourcePath || '?';
      var dst = action.destPath || '?';
      if (src.length > 40) src = '…' + src.slice(-35);
      if (dst.length > 40) dst = '…' + dst.slice(-35);
      return 'Move ' + src + ' → ' + dst;
    },
  });
})();
