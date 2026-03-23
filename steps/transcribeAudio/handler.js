/**
 * Transcribe audio step: get audio from row variable (data URL), call QC sandbox transcribeAudio(blob), save transcript to row variable.
 * Fails the row if transcription fails or variable is missing.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('transcribeAudio', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (transcribeAudio)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const audioVar = action.audioVariable || action.variableKey || 'capturedAudio';
    const saveVar = action.saveAsVariable || 'transcript';
    const audioValue = getRowValue(row, audioVar);
    if (!audioValue || typeof audioValue !== 'string') {
      throw new Error('Transcribe audio: no audio in variable "' + audioVar + '". Set the variable (e.g. from a capture or generator step) before this step.');
    }
    let blob = null;
    if (audioValue.startsWith('data:')) {
      try {
        const res = await fetch(audioValue);
        if (!res.ok) throw new Error('Fetch audio failed: ' + res.status);
        blob = await res.blob();
      } catch (e) {
        throw new Error('Transcribe audio: could not load audio from variable: ' + (e && e.message));
      }
    } else {
      throw new Error('Transcribe audio: variable "' + audioVar + '" must be a data URL (e.g. from capture or generator). Got: ' + String(audioValue).slice(0, 50) + '…');
    }
    if (!blob || !(blob instanceof Blob)) {
      throw new Error('Transcribe audio: no blob from variable "' + audioVar + '"');
    }
    const response = await sendMessage({ type: 'QC_CALL', method: 'transcribeAudio', args: [blob] });
    if (!response.ok) throw new Error(response.error || 'Transcription failed');
    const transcript = (response.result && response.result.text) != null ? String(response.result.text) : '';
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = transcript;
    }
  }, { needsElement: false });
})();
