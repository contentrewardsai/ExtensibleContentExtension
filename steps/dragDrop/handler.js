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
    const formPalette = /form-survey/i.test(String((action && action.frameOrigin) || location.origin || ''));
    if (sourceEl && sourceEl.querySelector && !formPalette) {
      const handle = sourceEl.querySelector('.gui__builder-card--handler');
      if (handle) sourceEl = handle;
    }
    if (!sourceEl || !targetEl) {
      if (action.optional) return;
      throw new Error('dragDrop: source or target not found');
    }
    try { sourceEl.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
    await sleep(200);
    const beforeItems = doc.querySelectorAll('form.builder-preview .form-builder--item, .form-builder--item').length;

    const view = doc.nodeType === 9 ? doc.defaultView : (doc.ownerDocument && doc.ownerDocument.defaultView) || window;
    const formDrop = /form-survey|builder-preview/i.test(String((action && action.frameOrigin) || '') + ' ' + String((targetEl.id || '') + (targetEl.className || '')));
    const dropAt = String((action && action.dropAt) || (formDrop ? 'center' : '')).toLowerCase();
    let inIframe = false;
    try { inIframe = window !== window.top; } catch (_) { inIframe = true; }

    function measureDragPoints() {
      const rs = sourceEl.getBoundingClientRect();
      const rt = targetEl.getBoundingClientRect();
      const x0 = formPalette ? (rs.left + rs.width / 2) : (rs.left + Math.min(8, Math.max(2, rs.width / 2)));
      const y0 = rs.top + rs.height / 2;
      let x1 = dropAt === 'center' || rt.width <= 200
        ? (rt.left + rt.width / 2)
        : (rt.left + rt.width - 80);
      let y1 = dropAt === 'center'
        ? (rt.top + rt.height / 2)
        : (rt.top + Math.min(40, Math.max(16, rt.height / 2)));
      if (formDrop) {
        const items = doc.querySelectorAll('form.builder-preview .form-builder--item, .form-builder--item');
        const last = items[items.length - 1];
        if (last) {
          try { last.scrollIntoView({ block: 'end', inline: 'nearest' }); } catch (_) {}
          const rl = last.getBoundingClientRect();
          const viewH = (doc.defaultView || window).innerHeight || rt.height;
          x1 = rl.left + rl.width / 2;
          y1 = Math.min(rl.bottom + 10, viewH - 12);
        }
      }
      return { from: { x: x0, y: y0 }, to: { x: x1, y: y1 }, source: { w: rs.width, h: rs.height }, target: { w: rt.width, h: rt.height } };
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const native = await new Promise(function (resolve) {
        let done = false;
        const finish = function (v) {
          if (done) return;
          done = true;
          resolve(v);
        };
        const timer = setTimeout(function () {
          finish({ ok: false, error: 'native drag timeout' });
        }, 15000);
        try {
          chrome.runtime.sendMessage({ type: 'CFS_NATIVE_DRAG', attachOnly: true }, function () {
            void chrome.runtime.lastError;
            setTimeout(function () {
              const pts = measureDragPoints();
              chrome.runtime.sendMessage({
                type: 'CFS_NATIVE_DRAG',
                from: pts.from,
                to: pts.to,
                inIframe: inIframe,
                frameOrigin: location.origin || '',
                frameUrl: location.href || '',
                preferMouse: !!formPalette,
                forceTab: !!formPalette,
                steps: Math.max(12, Math.min(40, parseInt(action.steps, 10) || 24)),
              }, function (resp) {
                clearTimeout(timer);
                finish(resp || { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message });
              });
            }, 80);
          });
        } catch (err) {
          clearTimeout(timer);
          finish({ ok: false, error: err && err.message });
        }
      });
      if (native && native.ok) {
        await sleep(action.settleMs != null ? action.settleMs : 400);
        if (!formDrop) return;
        let afterItems = doc.querySelectorAll('form.builder-preview .form-builder--item, .form-builder--item').length;
        if (afterItems > beforeItems) return;
        if (formPalette && native.iframeTarget) {
          const pts2 = measureDragPoints();
          const tabNative = await new Promise(function (resolve) {
            chrome.runtime.sendMessage({
              type: 'CFS_NATIVE_DRAG',
              from: pts2.from,
              to: pts2.to,
              inIframe: inIframe,
              forceTab: true,
              preferMouse: true,
              frameOrigin: location.origin || '',
              frameUrl: location.href || '',
              steps: Math.max(12, Math.min(40, parseInt(action.steps, 10) || 24)),
            }, function (resp) {
              resolve(resp || { ok: false });
            });
          });
          await sleep(400);
          afterItems = doc.querySelectorAll('form.builder-preview .form-builder--item, .form-builder--item').length;
          if (afterItems > beforeItems) return;
          void tabNative;
        }
      }
    }

    const owner = sourceEl;
    const pts = measureDragPoints();
    const x0 = pts.from.x;
    const y0 = pts.from.y;
    const x1 = pts.to.x;
    const y1 = pts.to.y;
    const steps = Math.max(8, Math.min(50, parseInt(action.steps, 10) || 24));
    const pause = Math.max(12, parseInt(action.stepDelayMs, 10) || 20);

    const dataTransfer = new DataTransfer();
    try { dataTransfer.effectAllowed = 'copyMove'; } catch (_) {}
    try { dataTransfer.dropEffect = 'copy'; } catch (_) {}
    try { dataTransfer.setData('text/plain', String(action.sourceText || action.text || 'drag')); } catch (_) {}

    function makeEvent(Ctor, type, extra) {
      return new Ctor(type, Object.assign({
        bubbles: true,
        cancelable: true,
        composed: true,
        view,
        clientX: extra.x,
        clientY: extra.y,
        screenX: extra.x,
        screenY: extra.y,
        button: 0,
        buttons: extra.buttons != null ? extra.buttons : 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        dataTransfer,
      }, extra.more || {}));
    }

    function fire(el, Ctor, type, extra) {
      if (!el) return;
      const ev = makeEvent(Ctor, type, extra);
      try { if (type === 'dragover' || type === 'drop' || type === 'dragenter') ev.preventDefault(); } catch (_) {}
      el.dispatchEvent(ev);
      if ((type === 'mousemove' || type === 'pointermove' || type === 'dragover') && owner && owner !== el) {
        try { owner.dispatchEvent(makeEvent(Ctor, type, extra)); } catch (_) {}
      }
    }

    function atPoint(x, y, fallback) {
      try {
        const hit = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(x, y) : null;
        return hit || fallback;
      } catch (_) {
        return fallback;
      }
    }

    fire(sourceEl, PointerEvent, 'pointerdown', { x: x0, y: y0, buttons: 1 });
    fire(sourceEl, MouseEvent, 'mousedown', { x: x0, y: y0, buttons: 1 });
    await sleep(80);
    fire(sourceEl, MouseEvent, 'mousemove', { x: x0 + 8, y: y0 + 4, buttons: 1 });
    fire(sourceEl, PointerEvent, 'pointermove', { x: x0 + 8, y: y0 + 4, buttons: 1 });
    fire(sourceEl, DragEvent, 'dragstart', { x: x0 + 8, y: y0 + 4, buttons: 1 });
    await sleep(40);

    let lastUnder = sourceEl;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const under = atPoint(x, y, targetEl);
      if (under !== lastUnder) {
        fire(under, DragEvent, 'dragenter', { x, y, buttons: 1 });
        lastUnder = under;
      }
      fire(under, PointerEvent, 'pointermove', { x, y, buttons: 1 });
      fire(under, MouseEvent, 'mousemove', { x, y, buttons: 1 });
      fire(under, DragEvent, 'dragover', { x, y, buttons: 1 });
      await sleep(pause);
    }

    fire(targetEl, DragEvent, 'dragenter', { x: x1, y: y1, buttons: 1 });
    fire(targetEl, DragEvent, 'dragover', { x: x1, y: y1, buttons: 1 });
    await sleep(40);
    fire(targetEl, DragEvent, 'drop', { x: x1, y: y1, buttons: 1 });
    fire(targetEl, MouseEvent, 'mouseup', { x: x1, y: y1, buttons: 0 });
    fire(targetEl, PointerEvent, 'pointerup', { x: x1, y: y1, buttons: 0 });
    fire(sourceEl, DragEvent, 'dragend', { x: x1, y: y1, buttons: 0 });

    await sleep(action.settleMs != null ? action.settleMs : 400);
    if (formDrop) {
      const afterItems = doc.querySelectorAll('form.builder-preview .form-builder--item, .form-builder--item').length;
      if (afterItems <= beforeItems) {
        throw new Error('dragDrop: form field did not appear after drop');
      }
    }
  }, { needsElement: false, handlesOwnWait: true });
})();
