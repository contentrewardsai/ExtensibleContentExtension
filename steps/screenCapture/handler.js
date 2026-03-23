/**
 * Screen capture step: start screen/tab audio recording.
 * Step completes immediately; workflow waits per proceedWhen (time, element, or manual).
 * Recording start/stop can be wired to background/offscreen in a future implementation.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('screenCapture', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) return;
    const { sendMessage } = ctx;
    const mode = action.mode || 'screen';
    try {
      /* Capture is driven by offscreen + mode (screen/tab); no per-tab id in the worker API. */
      await sendMessage({ type: 'START_SCREEN_CAPTURE', mode });
    } catch (_) {}
    return;
  }, { needsElement: false });
})();
