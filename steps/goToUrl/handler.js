/**
 * Go to URL step: handled in the player's executeNext (navigate current tab).
 * This handler is a no-op; the player sends a navigate response and the sidepanel updates the tab.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('goToUrl', async function(_action, _opts) {
    /* Handled in player executeNext before handler dispatch. */
    return;
  }, { needsElement: false });
})();
