/**
 * Copy bind is enforced in the service worker; tab playback no-ops.
 */
(function () {
  'use strict';

  window.__CFS_registerStepHandler(
    'selectFollowingAccount',
    async function () {},
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
