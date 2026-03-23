/**
 * Shared filters for CSS strings promoted into workflow discovery hints from analyze.
 * Aligns with the spirit of scoreSelectorString / auto-discovery: skip obviously unstable hashed classes.
 */
(function (global) {
  'use strict';

  function shouldSkipCssStringForDiscoveryCandidates(css) {
    if (!css || typeof css !== 'string') return true;
    var s = css.trim();
    if (!s.length || s.length > 500) return true;
    if (/[\r\n]/.test(s)) return true;
    if (/\[data-testid|\[data-cy|\[data-test|#mui|#radix/i.test(s)) return false;
    if (/^\.([a-z0-9_-]{10,})$/i.test(s)) {
      var cls = s.slice(1);
      if (/^(css-|sc-|jsx-|chakra|emotion|mui|radix|tw-|hover:|focus:)/i.test(cls)) return true;
      if (/^[a-f0-9]{8,}$/i.test(cls)) return true;
    }
    return false;
  }

  global.CFS_discoverySelectorFilters = {
    shouldSkipCssStringForDiscoveryCandidates: shouldSkipCssStringForDiscoveryCandidates,
  };
})(typeof window !== 'undefined' ? window : globalThis);
