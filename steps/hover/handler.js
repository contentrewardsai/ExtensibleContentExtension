/**
 * Hover step: move pointer over element (dispatch mouseenter + mouseover) so menus/dropdowns appear.
 * Use before a click when the target is revealed only on hover.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('hover', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (hover)');
    const doc = ctx.document || document;
    const resolveElementForAction = ctx.resolveElementForAction;
    const resolveElement = ctx.resolveElement;
    const sleep = ctx.sleep;

    const allSelectors = [].concat(action.selectors || [], action.fallbackSelectors || []);
    let el = null;
    if (typeof resolveElementForAction === 'function') {
      el = resolveElementForAction(action, doc);
    }
    if (!el && allSelectors.length && typeof resolveElement === 'function') {
      el = resolveElement(allSelectors, doc);
    }
    if (!el) throw new Error('Element not found for hover (tried ' + (action.selectors ? action.selectors.length : 0) + ' selectors)');

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(150);
    const rect = el.getBoundingClientRect();
    const optsEv = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, relatedTarget: null };
    el.dispatchEvent(new MouseEvent('mouseenter', optsEv));
    el.dispatchEvent(new MouseEvent('mouseover', optsEv));
    await sleep(200);
  }, { needsElement: true });
})();
