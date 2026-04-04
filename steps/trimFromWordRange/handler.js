/**
 * Map inclusive word indices from transcribeAudio word JSON to trim start/end times (seconds).
 */
(function() {
  'use strict';

  window.__CFS_registerStepHandler('trimFromWordRange', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (trimFromWordRange)');
    const { getRowValue, currentRow } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const wkey = (action.wordsVariableKey || 'transcriptWords').trim();
    const raw = getRowValue(row, wkey);
    let words;
    if (Array.isArray(raw)) {
      words = raw;
    } else if (raw != null && typeof raw === 'string' && raw.trim()) {
      try {
        words = JSON.parse(raw);
      } catch (e) {
        throw new Error('trimFromWordRange: invalid JSON in "' + wkey + '"');
      }
    } else {
      throw new Error('trimFromWordRange: missing word list in variable "' + wkey + '"');
    }
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error('trimFromWordRange: word list is empty');
    }

    const si = parseInt(String(action.startWordIndex != null ? action.startWordIndex : 0), 10);
    const ei = parseInt(String(action.endWordIndex != null ? action.endWordIndex : si), 10);
    if (!Number.isFinite(si) || !Number.isFinite(ei)) {
      throw new Error('trimFromWordRange: startWordIndex and endWordIndex must be numbers');
    }
    if (si < 0 || ei < si || ei >= words.length) {
      throw new Error('trimFromWordRange: indices out of range (0..' + (words.length - 1) + '), got ' + si + '..' + ei);
    }

    const first = words[si];
    const last = words[ei];
    const startSec = Number(first && first.start != null ? first.start : NaN);
    const endSec = Number(last && last.end != null ? last.end : NaN);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      throw new Error('trimFromWordRange: words[' + si + ']..[' + ei + '] missing start/end times');
    }
    if (endSec <= startSec) {
      throw new Error('trimFromWordRange: end time must be after start time');
    }

    const saveStart = (action.saveStartVariable || 'clipStart').trim() || 'clipStart';
    const saveEnd = (action.saveEndVariable || 'clipEnd').trim() || 'clipEnd';
    row[saveStart] = startSec;
    row[saveEnd] = endSec;
  }, { needsElement: false });
})();
