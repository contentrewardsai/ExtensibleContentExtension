/**
 * Player special-cases runWorkflowPlan (returns hop payload). Stub for the loader.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepHandler !== 'function') return;
  window.__CFS_registerStepHandler('runWorkflowPlan', async function() {
    /* Player special-cases this type before executeAction. */
  }, { needsElement: false });
})();
