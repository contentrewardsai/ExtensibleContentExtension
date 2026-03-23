/**
 * Whisper check step: compare transcript to expected text via QC sandbox (embedding similarity).
 * Fails the row if similarity < threshold (same as other steps throwing on failure).
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('whisperCheck', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (whisperCheck)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const transcriptVar = action.transcriptVariable || action.variableKey || 'transcript';
    const expectedVar = action.expectedVariable || 'expectedText';
    const transcript = getRowValue(row, transcriptVar);
    const expectedText = getRowValue(row, expectedVar);
    if (transcript == null || String(transcript).trim() === '') {
      throw new Error('Whisper check: no transcript in variable "' + transcriptVar + '". Add a transcribeAudio step before this step.');
    }
    if (expectedText == null || String(expectedText).trim() === '') {
      throw new Error('Whisper check: no expected text in variable "' + expectedVar + '". Set the variable in your row or workflow.');
    }
    const threshold = typeof action.threshold === 'number' ? action.threshold : 0.75;
    const response = await sendMessage({ type: 'QC_CALL', method: 'runWhisperCheck', args: [String(transcript).trim(), String(expectedText).trim(), threshold] });
    if (!response.ok) throw new Error(response.error || 'Whisper check failed');
    const result = response.result;
    if (!result) throw new Error('Whisper check: no result');
    if (!result.pass) {
      throw new Error(result.text || ('Quality check failed (similarity ' + (result.similarity != null ? result.similarity : '') + ' < ' + threshold + ')'));
    }
  }, { needsElement: false });
})();
