/**
 * Key step: dispatch keydown (and optionally keyup) for a given key (e.g. Escape).
 * Does not require an element; uses document as target.
 */
(function() {
  'use strict';
  const KEY_CODE = { Escape: 27, Enter: 13, Tab: 9, Space: 32 };

  window.__CFS_registerStepHandler('key', async function(action, opts) {
    const key = (action.key || 'Escape').trim();
    if (!key) return;
    const count = Math.max(1, parseInt(action.count, 10) || 1);
    const doc = typeof document !== 'undefined' ? document : (opts && opts.ctx && opts.ctx.document);
    if (!doc) return;
    const keyCode = KEY_CODE[key] || 0;
    const sleep = opts && opts.ctx && opts.ctx.sleep ? opts.ctx.sleep : (ms) => new Promise(r => setTimeout(r, ms));

    for (let i = 0; i < count; i++) {
      doc.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
      await sleep(80);
      doc.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, bubbles: true }));
      if (i < count - 1) await sleep(80);
    }
  }, { needsElement: false });
})();
