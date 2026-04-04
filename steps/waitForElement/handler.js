/**
 * Explicit wait for element visible or hidden (readable workflow step).
 */
(function() {
  'use strict';
  const POLL_MS = 500;

  window.__CFS_registerStepHandler('waitForElement', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (waitForElement)');
    const resolveDocumentForAction = ctx.resolveDocumentForAction;
    const resolveElementForActionInDocument = ctx.resolveElementForActionInDocument;
    const waitForElement = ctx.waitForElement;
    const isElementVisible = ctx.isElementVisible;
    const sleep = ctx.sleep;
    const assertPlaying = ctx.assertPlaying;
    const base = ctx.document || document;
    const doc = typeof resolveDocumentForAction === 'function'
      ? resolveDocumentForAction(action, base)
      : base;
    const state = action.state || 'visible';
    const sels = [].concat(action.selectors || [], action.fallbackSelectors || []);
    const timeoutMs = Math.max(action.timeoutMs != null ? action.timeoutMs : 30000, 5000);

    if (state === 'visible') {
      if (!sels.length) {
        if (action.optional) return;
        throw new Error('waitForElement (visible) requires selectors');
      }
      const stepInfo = {
        stepIndex: (ctx.actionIndex || 0) + 1,
        type: 'waitForElement',
        summary: '',
        action: action,
        rootDoc: doc,
      };
      try {
        await waitForElement(sels, timeoutMs, stepInfo);
      } catch (err) {
        if (action.optional) return;
        throw err;
      }
      return;
    }

    if (state === 'hidden') {
      if (!sels.length) {
        if (action.optional) return;
        throw new Error('waitForElement (hidden) requires selectors');
      }
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        assertPlaying();
        const el = typeof resolveElementForActionInDocument === 'function'
          ? resolveElementForActionInDocument(action, doc)
          : null;
        if (!el || !isElementVisible(el)) return;
        await sleep(POLL_MS);
      }
      if (action.optional) return;
      throw new Error('Element still visible after ' + (timeoutMs / 1000) + 's');
    }

    throw new Error('Unknown waitForElement state: ' + state);
  }, { needsElement: false, handlesOwnWait: true });
})();
