/**
 * Wait step: time, element, or generation complete.
 * Loaded at init; registers to window.__CFS_stepHandlers.wait.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('wait', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (wait)');
    const { sleep, waitForElement, waitForGenerationComplete, actionIndex } = ctx;
    const base = ctx.document || document;
    const scopedDoc = typeof ctx.resolveDocumentForAction === 'function'
      ? ctx.resolveDocumentForAction(action, base)
      : base;
    if (action.waitFor === 'generationComplete') {
      const timeout = Math.max(action.durationMax ?? action.duration ?? 120000, 10000);
      const stepInfo = { stepIndex: (actionIndex || 0) + 1, type: 'wait', summary: 'until generation complete' };
      const cfg = {
        rootDoc: scopedDoc,
        containerSelectors: action.waitForSelectors || action.waitForGenerationComplete?.containerSelectors,
        videoSelector: action.waitForGenerationComplete?.videoSelector || 'video[src]',
        cardIndex: action.waitForGenerationComplete?.cardIndex ?? 'last',
      };
      await waitForGenerationComplete(cfg, timeout, stepInfo);
    } else {
      let duration = action.duration || 1000;
      if (action.durationMin != null && action.durationMax != null) {
        const min = Math.min(action.durationMin, action.durationMax);
        const max = Math.max(action.durationMin, action.durationMax);
        duration = min === max ? min : Math.floor(min + Math.random() * (max - min + 1));
      }
      if (action.waitFor === 'element') {
        const waitSels = [].concat(action.waitForSelectors || [], action.fallbackSelectors || []);
        if (waitSels.length) {
          const elTimeout = Math.max(action.durationMax ?? action.duration ?? 30000, 5000);
          const elStepInfo = { stepIndex: (actionIndex || 0) + 1, type: 'wait', summary: 'until element visible', action, rootDoc: scopedDoc };
          await waitForElement(waitSels, elTimeout, elStepInfo);
        } else {
          await sleep(duration);
        }
      } else {
        await sleep(duration);
      }
    }
  });
})();
