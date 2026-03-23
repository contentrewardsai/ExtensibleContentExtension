/**
 * Extract data step: extract list from page and send rows to sidepanel.
 * Loaded at init; registers to window.__CFS_stepHandlers.extractData.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('extractData', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (extractData)');
    const { runExtractData, sendMessage } = ctx;
    const result = await runExtractData({
      listSelector: action.listSelector,
      itemSelector: action.itemSelector,
      fields: action.fields || [],
      maxItems: action.maxItems,
    });
    if (!result.ok) throw new Error(result.error || 'Extraction failed');
    if (typeof sendMessage === 'function') {
      sendMessage({ type: 'EXTRACTED_ROWS', rows: result.rows || [] }).catch(function() {});
    }
  });
})();
