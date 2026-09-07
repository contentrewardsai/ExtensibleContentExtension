/**
 * Shared string helpers (no DOM). Loaded in SW, content, side panel, and Settings.
 */
(function (global) {
  'use strict';

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  global.CFS_strUtils = {
    trimStr: trimStr,
  };
  global.CFS_trimStr = trimStr;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
