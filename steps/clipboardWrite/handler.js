/**
 * Write plain text to the system clipboard ({{var}} substitution via template resolver).
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('clipboardWrite', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (clipboardWrite)');
    const row = ctx.currentRow || {};
    const getRowValue = ctx.getRowValue;
    const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
      ? CFS_templateResolver.resolveTemplate
      : function(s, r, g) { return String(s || ''); };
    const raw = resolveTemplate(String(action.text != null ? action.text : ''), row, getRowValue, action);
    try {
      await navigator.clipboard.writeText(raw);
    } catch (e) {
      throw new Error('clipboardWrite failed: ' + (e && e.message ? e.message : String(e)));
    }
  }, { needsElement: false });
})();
