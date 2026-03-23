/**
 * Shared estimateWords: split text into tokens with estimated start/end timings.
 * Used by STT modules to produce word-level timestamps when the backend doesn't provide them.
 */
(function (global) {
  'use strict';

  function estimateWords(text, offset) {
    var tokens = (text || '').toString().trim().split(/\s+/).filter(Boolean);
    var t = offset || 0;
    return tokens.map(function (tok) {
      var clean = tok.replace(/[^\w]/g, '');
      var dur = Math.max(0.2, Math.min(0.7, (clean.length || 3) * 0.045));
      if (/[,.!?;:]$/.test(tok)) dur += 0.12;
      var out = { text: tok, start: Number(t.toFixed(3)), end: Number((t + dur).toFixed(3)) };
      t += dur;
      return out;
    });
  }

  global.__CFS_estimateWords = estimateWords;
})(typeof window !== 'undefined' ? window : globalThis);
