/**
 * Delay before next run: config-only step for Run All Rows.
 * When this step is in the workflow, the batch runner uses its delayMs between rows.
 * The player runs it as a no-op (completes immediately).
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('delayBeforeNextRun', async function(_action, _opts) {
    return;
  }, { needsElement: false });
})();
