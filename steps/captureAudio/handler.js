/**
 * Capture audio step: capture from element (video/audio), tab, or display picker.
 * Saves data URL to row variable for use by transcribeAudio or other steps.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('captureAudio', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (captureAudio)');
    const { captureAudioFromElement, sendMessage, currentRow, resolveElement, document } = ctx;
    const mode = (action.mode || 'element').toLowerCase();
    const durationMs = Math.min(Math.max(action.durationMs || 10000, 1000), 60000);
    const saveVar = (action.saveAsVariable || '').trim() || 'capturedAudio';

    let dataUrl = null;

    if (mode === 'element') {
      if (!captureAudioFromElement) {
        throw new Error('Capture audio: element mode requires captureAudioFromElement in context. Ensure player is up to date.');
      }
      const selectors = action.selectors;
      const arr = Array.isArray(selectors)
        ? selectors
        : typeof selectors === 'string'
          ? selectors.trim()
            ? (selectors.trim().startsWith('[') ? (() => { try { return JSON.parse(selectors); } catch (_) { return [selectors]; } })() : [selectors])
            : []
          : [];
      if (!arr.length) {
        throw new Error('Capture audio (element): provide selectors for the video/audio element or its container.');
      }
      const doc = document || (typeof document !== 'undefined' ? document : null);
      const blob = await captureAudioFromElement(arr, durationMs, doc);
      if (!blob || !(blob instanceof Blob)) {
        throw new Error('Capture audio: no audio captured from element. Check selectors and that the media is playing.');
      }
      dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result || null);
        r.onerror = () => reject(new Error('Could not read captured blob'));
        r.readAsDataURL(blob);
      });
    } else if (mode === 'tab') {
      const res = await sendMessage({ type: 'TAB_CAPTURE_AUDIO', durationMs });
      if (!res || !res.ok) {
        throw new Error(res?.error || 'Tab audio capture failed');
      }
      const base64 = res.base64;
      const contentType = res.contentType || 'audio/webm';
      dataUrl = base64 ? 'data:' + contentType + ';base64,' + base64 : null;
    } else if (mode === 'display') {
      const res = await sendMessage({ type: 'CAPTURE_DISPLAY_AUDIO', durationMs });
      if (!res || !res.ok) {
        throw new Error(res?.error || 'Display audio capture failed');
      }
      dataUrl = res.dataUrl || null;
    } else {
      throw new Error('Capture audio: unknown mode "' + mode + '". Use element, tab, or display.');
    }

    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('Capture audio: no audio data received');
    }

    const row = currentRow;
    if (row && typeof row === 'object' && saveVar) {
      row[saveVar] = dataUrl;
    }
  }, { needsElement: false });
})();
