/**
 * Open tab step: open new tab/window, optionally switch playback to it.
 * Handled in the player's executeNext (sends openTab response or PLAYER_OPEN_TAB message).
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('openTab', async function(_action, _opts) {
    /* Handled in player executeNext before handler dispatch. */
    return;
  }, { needsElement: false });
})();
