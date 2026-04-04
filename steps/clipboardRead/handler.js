/**
 * Read system clipboard text into a row variable.
 * Requires manifest clipboardRead; browser may still require a recent user gesture.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('clipboardRead', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (clipboardRead)');
    const saveAs = String(action.saveAsVariable || '').trim();
    if (!saveAs) throw new Error('clipboardRead requires saveAsVariable');
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      throw new Error('clipboardRead failed: ' + (e && e.message ? e.message : String(e)) + '. Try running right after clicking Run, or check extension clipboard permission.');
    }
    if (ctx.currentRow && typeof ctx.currentRow === 'object') {
      ctx.currentRow[saveAs] = text;
    }
  }, { needsElement: false });
})();
