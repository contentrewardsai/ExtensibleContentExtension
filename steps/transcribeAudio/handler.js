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
    const wordsVar = (action.saveWordsToVariable || '').trim();
    const audioValue = getRowValue(row, audioVar);
    if (!audioValue || typeof audioValue !== 'string') {
      throw new Error('Transcribe audio: no audio in variable "' + audioVar + '". Set the variable (e.g. from a capture or generator step) before this step.');
    }
    const trimmed = audioValue.trim();
    let blob = null;
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      try {
        const res = await fetch(trimmed);
        if (!res.ok) throw new Error('Fetch audio failed: ' + res.status);
        blob = await res.blob();
      } catch (e) {
        throw new Error('Transcribe audio: could not load audio from variable: ' + (e && e.message));
      }
    } else if (/^https?:\/\//i.test(trimmed)) {
      const fr = await sendMessage({ type: 'FETCH_FILE', url: trimmed });
      if (!fr || !fr.ok || !fr.base64) {
        throw new Error('Transcribe audio: could not fetch URL audio: ' + ((fr && fr.error) || 'unknown'));
      }
      const mime = fr.contentType && String(fr.contentType).split(';')[0].trim() || 'audio/wav';
      try {
        const bin = atob(String(fr.base64).replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: mime });
      } catch (e) {
        throw new Error('Transcribe audio: invalid fetched audio data');
      }
    } else {
      throw new Error('Transcribe audio: variable must be a data URL, blob URL, or http(s) URL. Got: ' + String(audioValue).slice(0, 50) + '…');
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
    const words = response.result && response.result.words;
    if (wordsVar && row && typeof row === 'object' && words && Array.isArray(words) && words.length) {
      try {
        row[wordsVar] = JSON.stringify(words);
      } catch (_) {}
    }
  }, { needsElement: false });
})();
