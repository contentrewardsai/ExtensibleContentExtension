/**
 * DOM escaping helpers for extension UI pages.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  global.CFS_domUtils = {
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
  };
})(typeof window !== 'undefined' ? window : globalThis);
