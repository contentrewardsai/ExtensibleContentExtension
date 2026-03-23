/**
 * Quality check step: config-only. QC runs in the sidepanel after playback;
 * the player does nothing for this step type.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('qualityCheck', async function(_action, _opts) {
    /* Config-only; QC runs in sidepanel after playback. */
    return;
  }, { needsElement: false });
})();
