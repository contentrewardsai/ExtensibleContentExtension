/**
 * Key step: dispatch keydown/keyup on the active document (top, iframe, or shadow host document).
 */
(function() {
  'use strict';
  const KEY_CODE = { Escape: 27, Enter: 13, Tab: 9, Space: 32 };

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
    const sleep = ctx && ctx.sleep ? ctx.sleep : (ms) => new Promise(function(r) { setTimeout(r, ms); });

    for (let i = 0; i < count; i++) {
      targetDoc.dispatchEvent(new KeyboardEvent('keydown', { key: key, keyCode: keyCode, bubbles: true }));
      await sleep(80);
      targetDoc.dispatchEvent(new KeyboardEvent('keyup', { key: key, keyCode: keyCode, bubbles: true }));
      if (i < count - 1) await sleep(80);
    }
  }, { needsElement: false });
})();
