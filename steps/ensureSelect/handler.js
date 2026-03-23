/**
 * Ensure dropdown step: ensure a dropdown shows a specific value; open and select if not.
 * Loaded at init; registers to window.__CFS_stepHandlers.ensureSelect.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('ensureSelect', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (ensureSelect)');
    const { executeEnsureSelect } = ctx;
    await executeEnsureSelect(action);
  }, { needsElement: true });
})();
