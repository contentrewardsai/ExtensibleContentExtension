/**
 * Go forward step: navigate the browser forward one page in session history.
 * Equivalent to clicking the browser's Forward button or calling history.forward().
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('goForward', async function(_action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (goForward)');
    window.history.forward();
    /* Give the browser a moment to start the navigation. */
    await ctx.sleep(500);
  }, { needsElement: false, handlesOwnWait: true });
})();
