/**
 * Extract audio from a video blob/data URL via offscreen FFmpeg; stores result as data URL on the row.
 */
(function() {
  'use strict';

  function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onloadend = function() {
        var s = String(r.result || '');
        var i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = function() { reject(new Error('read failed')); };
      r.readAsDataURL(blob);
    });
  }

  window.__CFS_registerStepHandler('extractAudioFromVideo', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (extractAudioFromVideo)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const vidVar = (action.videoVariableKey || action.videoVariable || 'sourceVideo').trim();
    const saveAs = (action.saveAsVariable || 'extractedAudio').trim();
    const raw = getRowValue(row, vidVar);
    if (!raw || typeof raw !== 'string') {
      throw new Error('extractAudioFromVideo: no video in variable "' + vidVar + '"');
    }
    const trimmed = raw.trim();
    if (!trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
      throw new Error('extractAudioFromVideo: variable must be a data or blob URL');
    }
    let blob;
    try {
      const res = await fetch(trimmed);
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      blob = await res.blob();
    } catch (e) {
      throw new Error('extractAudioFromVideo: could not load video — ' + (e && e.message));
    }
    if (!blob || !(blob instanceof Blob)) {
      throw new Error('extractAudioFromVideo: no blob from variable');
    }

    const base64 = await blobToBase64(blob);
    const mimeType = blob.type || 'video/webm';

    const out = await sendMessage({
      type: 'EXTRACT_AUDIO_FROM_VIDEO',
      base64: base64,
      mimeType: mimeType,
    });
    if (!out || !out.ok || !out.dataUrl) {
      throw new Error((out && out.error) || 'extractAudioFromVideo: extraction failed');
    }
    row[saveAs] = out.dataUrl;
  }, { needsElement: false });
})();
