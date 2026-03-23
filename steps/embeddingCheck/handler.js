/**
 * Embedding check step: compare two text variables via QC sandbox runEmbeddingCheck.
 * Fails the row if similarity < threshold.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('embeddingCheck', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (embeddingCheck)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const outputVar = action.outputVariable || action.variableKey || 'outputText';
    const expectedVar = action.expectedVariable || 'expectedText';
    const outputText = getRowValue(row, outputVar);
    const expectedText = getRowValue(row, expectedVar);
    if (outputText == null || String(outputText).trim() === '') {
      throw new Error('Embedding check: no output text in variable "' + outputVar + '". Set the variable before this step.');
    }
    if (expectedText == null || String(expectedText).trim() === '') {
      throw new Error('Embedding check: no expected text in variable "' + expectedVar + '". Set the variable in your row or workflow.');
    }
    const threshold = typeof action.threshold === 'number' ? action.threshold : 0.75;
    const response = await sendMessage({ type: 'QC_CALL', method: 'runEmbeddingCheck', args: [String(outputText).trim(), String(expectedText).trim(), threshold] });
    if (!response.ok) throw new Error(response.error || 'Embedding check failed');
    const result = response.result;
    if (!result) throw new Error('Embedding check: no result');
    if (!result.pass) {
      throw new Error(result.text || ('Embedding check failed (similarity ' + (result.similarity != null ? result.similarity : '') + ' < ' + threshold + ')'));
    }
  }, { needsElement: false });
})();
