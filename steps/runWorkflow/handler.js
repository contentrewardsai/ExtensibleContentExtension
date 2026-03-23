/**
 * Run workflow step: executed inline by the player (content/player.js) before step handlers.
 * This stub exists so the loader can inject it; the player never dispatches to it.
 */
(function() {
  'use strict';
  if (typeof window.__CFS_registerStepHandler !== 'function') return;
  window.__CFS_registerStepHandler('runWorkflow', async function(_action, _opts) {
    /* Executed inline by the player; this stub is not called. */
    return;
  }, { needsElement: false });
})();
