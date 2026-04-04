/**
 * Key step: dispatch keydown/keyup on the focused element when possible (so Enter activates
 * a focused link), else on the active document (top, iframe, or shadow-scoped document).
 */
(function() {
  'use strict';
  /** Legacy keyCode values for sites that still read them (matches keys the recorder may emit). */
  const KEY_CODE = {
    Escape: 27,
    Enter: 13,
    Tab: 9,
    ' ': 32,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    PageUp: 33,
    PageDown: 34,
    Home: 36,
    End: 35,
    Backspace: 8,
    Delete: 46,
  };

  const KEY_TO_CODE = {
    Escape: 'Escape',
    Enter: 'Enter',
    Tab: 'Tab',
    ' ': 'Space',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Home: 'Home',
    End: 'End',
    Backspace: 'Backspace',
    Delete: 'Delete',
  };

  function getDeepActiveElement(doc) {
    if (!doc) return null;
    let el = doc.activeElement;
    if (!el || el.nodeType !== 1) return null;
    while (el.shadowRoot && el.shadowRoot.activeElement) {
      const inner = el.shadowRoot.activeElement;
      if (!inner || inner.nodeType !== 1) break;
      el = inner;
    }
    return el;
  }

  function getKeyDispatchTarget(targetDoc) {
    try {
      const ae = getDeepActiveElement(targetDoc);
      if (ae && ae.nodeType === 1 && ae.ownerDocument === targetDoc) return ae;
    } catch (_) {}
    return targetDoc;
  }

  window.__CFS_registerStepHandler('key', async function(action, opts) {
    const ctx = opts && opts.ctx;
    const key = (action.key || 'Escape').trim();
    if (!key) return;
    const count = Math.max(1, parseInt(action.count, 10) || 1);
    const base = (ctx && ctx.document) || (typeof document !== 'undefined' ? document : null);
    if (!base) return;

    let targetDoc = base.nodeType === 9 ? base : (typeof document !== 'undefined' ? document : base);
    if (ctx && typeof ctx.resolveDocumentForAction === 'function') {
      try {
        const scoped = ctx.resolveDocumentForAction(action, base);
        if (scoped && scoped.nodeType === 9) targetDoc = scoped;
        else if (scoped && scoped.nodeType === 11 && scoped.ownerDocument) targetDoc = scoped.ownerDocument;
      } catch (_) {}
    }

    const keyCode = KEY_CODE[key] || 0;
    const code = KEY_TO_CODE[key] || '';
    const sleep = ctx && ctx.sleep ? ctx.sleep : (ms) => new Promise(function(r) { setTimeout(r, ms); });

    const eventInit = { key: key, keyCode: keyCode, bubbles: true, cancelable: true };
    if (code) eventInit.code = code;
    if (keyCode) eventInit.which = keyCode;

    for (let i = 0; i < count; i++) {
      const targetEl = getKeyDispatchTarget(targetDoc);
      const down = new KeyboardEvent('keydown', eventInit);
      const up = new KeyboardEvent('keyup', eventInit);
      targetEl.dispatchEvent(down);
      await sleep(80);
      targetEl.dispatchEvent(up);
      if (i < count - 1) await sleep(80);
    }
  }, { needsElement: false });
})();
