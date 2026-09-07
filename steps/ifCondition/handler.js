/**
 * ifCondition is executed by the player (thenSteps / elseSteps), not this stub.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepHandler !== 'function') return;
  window.__CFS_registerStepHandler('ifCondition', async function() {
    /* Player special-cases this type before executeAction. */
  }, { needsElement: false });
})();
