/**
 * Normalize a row variable value to an array for rowListFilter / rowListJoin.
 * - Arrays pass through.
 * - JSON strings starting with [ or { parse to array or [object].
 */
(function(global) {
  'use strict';

  /**
   * @param {*} raw - value from row (array, string, etc.)
   * @param {string} label - prefix for error messages
   * @returns {Array}
   */
  function normalize(raw, label) {
    var L = String(label || 'row list').trim() || 'row list';
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      var t = raw.trim();
      if (!t) throw new Error(L + ': empty value is not an array');
      if (t[0] === '[' || t[0] === '{') {
        try {
          var p = JSON.parse(t);
          if (Array.isArray(p)) return p;
          if (p !== null && typeof p === 'object') return [p];
          throw new Error(L + ': JSON must be an array or object');
        } catch (e) {
          if (e instanceof SyntaxError || (e && e.name === 'SyntaxError')) {
            throw new Error(L + ': invalid JSON (array or object)');
          }
          throw e;
        }
      }
      throw new Error(L + ': expected an array or JSON array/object string');
    }
    if (raw == null) throw new Error(L + ': missing or null');
    throw new Error(L + ': expected an array (got ' + typeof raw + ')');
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function mergedEvalRow(parentRow, el) {
    var base = parentRow && typeof parentRow === 'object' ? parentRow : {};
    if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
      return Object.assign({}, base, el);
    }
    return Object.assign({}, base, { _item: el });
  }

  function sliceResult(arr, offset, limit) {
    var hasO = offset != null && offset !== '';
    var hasL = limit != null && limit !== '';
    if (!hasO && !hasL) return arr.slice();
    var o = hasO ? Number(offset) : 0;
    if (!Number.isFinite(o) || o < 0) o = 0;
    o = Math.floor(o);
    if (hasL) {
      var l = Number(limit);
      if (!Number.isFinite(l) || l < 0) l = 0;
      return arr.slice(o, o + Math.floor(l));
    }
    return arr.slice(o);
  }

  if (typeof global !== 'undefined') {
    global.CFS_rowListNormalize = {
      normalize: normalize,
      isPlainObject: isPlainObject,
      mergedEvalRow: mergedEvalRow,
      sliceResult: sliceResult,
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);
