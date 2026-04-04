/**
 * Drag from source element to target (synthetic mouse events).
 */
(function() {
  'use strict';

  function mergeSels(action, primaryKey, fbKey) {
    return [].concat(action[primaryKey] || [], action[fbKey] || []);
  }

  window.__CFS_registerStepHandler('dragDrop', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (dragDrop)');
    const resolveDocumentForAction = ctx.resolveDocumentForAction;
    const resolveElement = ctx.resolveElement;
    const waitForElement = ctx.waitForElement;
    const sleep = ctx.sleep;
    const base = ctx.document || document;
    const doc = typeof resolveDocumentForAction === 'function'
      ? resolveDocumentForAction(action, base)
      : base;

    const sourceSels = mergeSels(action, 'sourceSelectors', 'sourceFallbackSelectors');
    const targetSels = mergeSels(action, 'targetSelectors', 'targetFallbackSelectors');
    if (!sourceSels.length || !targetSels.length) {
      throw new Error('dragDrop requires sourceSelectors and targetSelectors');
    }

    const timeoutMs = Math.max(action.timeoutMs != null ? action.timeoutMs : 30000, 5000);
    const stepIndex = (ctx.actionIndex || 0) + 1;

    try {
      await waitForElement(sourceSels, timeoutMs, {
        stepIndex,
        type: 'dragDrop',
        summary: 'source',
        action,
        rootDoc: doc,
      });
      await waitForElement(targetSels, timeoutMs, {
        stepIndex,
        type: 'dragDrop',
        summary: 'target',
        action,
        rootDoc: doc,
      });
    } catch (err) {
      if (action.optional) return;
      throw err;
    }

    const sourceEl = resolveElement(sourceSels, doc);
    const targetEl = resolveElement(targetSels, doc);
    if (!sourceEl || !targetEl) {
      if (action.optional) return;
      throw new Error('dragDrop: source or target not found');
    }

    const view = doc.nodeType === 9 ? doc.defaultView : (doc.ownerDocument && doc.ownerDocument.defaultView) || window;
    const rs = sourceEl.getBoundingClientRect();
    const rt = targetEl.getBoundingClientRect();
    const x0 = rs.left + rs.width / 2;
    const y0 = rs.top + rs.height / 2;
    const x1 = rt.left + rt.width / 2;
    const y1 = rt.top + rt.height / 2;

    const steps = Math.max(3, Math.min(40, parseInt(action.steps, 10) || 12));
    const pause = Math.max(10, parseInt(action.stepDelayMs, 10) || 25);

    const dataTransfer = new DataTransfer();

    sourceEl.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x0,
      clientY: y0,
      button: 0,
      buttons: 1,
      dataTransfer,
    }));

    sourceEl.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x0,
      clientY: y0,
      button: 0,
      buttons: 1,
    }));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      let under = targetEl;
      try {
        if (typeof doc.elementFromPoint === 'function') {
          const hit = doc.elementFromPoint(x, y);
          if (hit) under = hit;
        } else if (doc.ownerDocument && typeof doc.ownerDocument.elementFromPoint === 'function') {
          const hit = doc.ownerDocument.elementFromPoint(x, y);
          if (hit) under = hit;
        }
      } catch (_) {}
      under.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
      }));
      under.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        view,
        clientX: x,
        clientY: y,
        dataTransfer,
      }));
      await sleep(pause);
    }

    targetEl.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x1,
      clientY: y1,
      dataTransfer,
    }));
    targetEl.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x1,
      clientY: y1,
      dataTransfer,
    }));
    targetEl.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x1,
      clientY: y1,
      button: 0,
      buttons: 0,
    }));
    sourceEl.dispatchEvent(new DragEvent('dragend', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x1,
      clientY: y1,
      dataTransfer,
    }));

    await sleep(action.settleMs != null ? action.settleMs : 150);
  }, { needsElement: false, handlesOwnWait: true });
})();
