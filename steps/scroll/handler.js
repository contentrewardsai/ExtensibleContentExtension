/**
 * Scroll: intoView (selector) or delta on window / optional scroll container.
 */
(function() {
  'use strict';

  function isLikelyScrollContainer(node) {
    if (!node || node.nodeType !== 1 || typeof node.scrollBy !== 'function') return false;
    const sh = node.scrollHeight - node.clientHeight;
    const sw = node.scrollWidth - node.clientWidth;
    if (sh <= 1 && sw <= 1) return false;
    const win = node.ownerDocument && node.ownerDocument.defaultView;
    if (!win || !win.getComputedStyle) return true;
    const st = win.getComputedStyle(node);
    const oy = st.overflowY;
    const ox = st.overflowX;
    return /(auto|scroll|overlay)/.test(oy) || /(auto|scroll|overlay)/.test(ox);
  }

  /** If the resolved element is not scrollable, walk up to a scrollable ancestor (plan: delta + container). */
  function resolveScrollTargetForDelta(startEl, rootDoc) {
    if (startEl && isLikelyScrollContainer(startEl)) return startEl;
    let n = startEl;
    const owner = rootDoc && rootDoc.nodeType === 9 ? rootDoc : (rootDoc && rootDoc.ownerDocument) || document;
    const top = owner.documentElement || owner.body;
    for (let i = 0; n && i < 80; i++) {
      if (n === top) break;
      const p = n.parentElement || (n.parentNode && n.parentNode.nodeType === 1 ? n.parentNode : null);
      if (!p) break;
      n = p;
      if (isLikelyScrollContainer(n)) return n;
    }
    return null;
  }

  window.__CFS_registerStepHandler('scroll', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (scroll)');
    const sleep = ctx.sleep;
    const waitForElement = ctx.waitForElement;
    const resolveDocumentForAction = ctx.resolveDocumentForAction;
    const resolveElementForActionInDocument = ctx.resolveElementForActionInDocument;
    const resolveElement = ctx.resolveElement;
    const base = ctx.document || document;
    const doc = typeof resolveDocumentForAction === 'function'
      ? resolveDocumentForAction(action, base)
      : base;
    const mode = action.mode || 'intoView';
    const behavior = action.behavior === 'smooth' ? 'smooth' : 'auto';

    if (mode === 'intoView') {
      const sels = [].concat(action.selectors || [], action.fallbackSelectors || []);
      if (!sels.length) throw new Error('Scroll intoView requires selectors');
      const stepInfo = {
        stepIndex: (ctx.actionIndex || 0) + 1,
        type: 'scroll',
        summary: 'scroll target',
        action: action,
        rootDoc: doc,
      };
      const timeoutMs = Math.max(action.timeoutMs != null ? action.timeoutMs : action.duration != null ? action.duration : 30000, 5000);
      try {
        await waitForElement(sels, timeoutMs, stepInfo);
      } catch (err) {
        if (action.optional) return;
        throw err;
      }
      const el = typeof resolveElementForActionInDocument === 'function'
        ? resolveElementForActionInDocument(action, doc)
        : null;
      if (!el) throw new Error('Element not found for scroll into view');
      el.scrollIntoView({ behavior: behavior, block: 'center', inline: 'nearest' });
      await sleep(action.settleMs != null ? action.settleMs : 200);
      return;
    }

    if (mode === 'delta') {
      const dx = Number(action.scrollX) || Number(action.deltaX) || 0;
      const dy = Number(action.scrollY) || Number(action.deltaY) || 0;
      const contSels = [].concat(action.containerSelectors || [], action.containerFallbackSelectors || []);
      let scrollEl = null;
      if (contSels.length && typeof resolveElement === 'function') {
        const picked = resolveElement(contSels, doc);
        scrollEl = resolveScrollTargetForDelta(picked, doc);
      }
      if (scrollEl && typeof scrollEl.scrollBy === 'function') {
        scrollEl.scrollBy({ left: dx, top: dy, behavior: behavior });
      } else {
        const owner = doc.nodeType === 9 ? doc : (doc.ownerDocument || document);
        const win = owner.defaultView || window;
        win.scrollBy({ left: dx, top: dy, behavior: behavior });
      }
      await sleep(action.settleMs != null ? action.settleMs : 100);
      return;
    }

    throw new Error('Unknown scroll mode: ' + mode);
  }, { needsElement: false, handlesOwnWait: true });
})();
