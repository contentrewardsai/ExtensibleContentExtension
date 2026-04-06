/**
 * Go back step: navigate the browser back one page in session history.
 * Equivalent to clicking the browser's Back button or calling history.back().
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('goBack', async function(_action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (goBack)');
    window.history.back();
    /* Give the browser a moment to start the navigation. */
    await ctx.sleep(500);
  }, { needsElement: false, handlesOwnWait: true });
})();
