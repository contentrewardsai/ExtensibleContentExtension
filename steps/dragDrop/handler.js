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

    const timeoutMs = Math.max(action.timeoutMs != null ? action.timeoutMs : 20000, 4000);
    const stepIndex = (ctx.actionIndex || 0) + 1;

    function pickVisible(sels, hint) {
      const resolveAllCandidates = ctx.resolveAllCandidates;
      const list = typeof resolveAllCandidates === 'function' ? (resolveAllCandidates(sels, doc) || []) : [];
      const els = list.map(function (c) { return c && c.element; }).filter(Boolean);
      const want = String(hint || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const scored = els.filter(function (el) {
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.x >= 0 && r.y >= 0;
      });
      if (want) {
        const exact = scored.filter(function (el) {
          const t = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return t === want || t.indexOf(want) === 0;
        });
        if (exact.length) return exact[0];
      }
      return scored[0] || (typeof resolveElement === 'function' ? resolveElement(sels, doc) : null);
    }

    let sourceEl = pickVisible(sourceSels, action.sourceText || action.text);
    let targetEl = pickVisible(targetSels, '');
    if (sourceEl && targetEl) {
      /* already on screen — skip the long wait */
    } else try {
      await waitForElement(sourceSels, timeoutMs, {
        stepIndex,
        type: 'dragDrop',
        summary: action.sourceText || action.text || 'source',
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

    sourceEl = sourceEl || pickVisible(sourceSels, action.sourceText || action.text);
    targetEl = targetEl || pickVisible(targetSels, '');
    if (sourceEl && sourceEl.querySelector) {
      const handle = sourceEl.querySelector('.gui__builder-card--handler');
      if (handle) sourceEl = handle;
    }
    if (!sourceEl || !targetEl) {
      if (action.optional) return;
      throw new Error('dragDrop: source or target not found');
    }

    const view = doc.nodeType === 9 ? doc.defaultView : (doc.ownerDocument && doc.ownerDocument.defaultView) || window;
    const rs = sourceEl.getBoundingClientRect();
    const rt = targetEl.getBoundingClientRect();
    const x0 = rs.left + Math.min(8, Math.max(2, rs.width / 2));
    const y0 = rs.top + rs.height / 2;
    const x1 = rt.left + rt.width / 2;
    const y1 = rt.top + rt.height / 2;

    const steps = Math.max(3, Math.min(40, parseInt(action.steps, 10) || 12));
    const pause = Math.max(10, parseInt(action.stepDelayMs, 10) || 25);

    const dataTransfer = new DataTransfer();
    try { dataTransfer.setData('text/plain', String(action.sourceText || action.text || 'drag')); } catch (_) {}

    sourceEl.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x0,
      clientY: y0,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    }));

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
      under.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        view,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }));
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
    targetEl.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: x1,
      clientY: y1,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
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
