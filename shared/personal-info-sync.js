/**
 * personalInfo: masking rules for QC, preview, and type/select substitution.
 *
 * Item shape (extension):
 * - Phrase (local / unpublished): { text?, pickedText?, selectors?, replacementWord|replacement, localOnly?, mode? }
 * - Publishable (no secret literal): { selectors (non-empty), replacementWord|replacement,
 *     mode?: 'replacePhrase'|'replaceWholeElement'|'replaceRegexInElement', regex?: string (when mode=replaceRegexInElement) }
 *
 * Modes:
 * - replacePhrase (default): substring replace of text/pickedText in tree; type/select match exact text.
 * - replaceWholeElement: resolve selectors; mask whole element text (and attrs) with replacement.
 * - replaceRegexInElement: resolve selectors; replace regex matches inside element text/attrs only (regex is public pattern).
 *
 * Sync: When workflow.published, API payload must omit text/pickedText and localOnly-only rows; see cloneWorkflowForPublishedSync.
 */
(function (global) {
  'use strict';

  var MODES = {
    REPLACE_PHRASE: 'replacePhrase',
    REPLACE_WHOLE_ELEMENT: 'replaceWholeElement',
    REPLACE_REGEX_IN_ELEMENT: 'replaceRegexInElement',
  };

  function normalizeMode(m) {
    if (m === MODES.REPLACE_WHOLE_ELEMENT || m === MODES.REPLACE_REGEX_IN_ELEMENT) return m;
    return MODES.REPLACE_PHRASE;
  }

  function hasSelectors(item) {
    return item && Array.isArray(item.selectors) && item.selectors.length > 0;
  }

  function secretText(item) {
    if (!item) return '';
    var t = item.text != null ? String(item.text) : '';
    var p = item.pickedText != null ? String(item.pickedText) : '';
    return (t.trim() || p.trim());
  }

  function isLocalOnly(item) {
    return !!(item && item.localOnly);
  }

  /**
   * True if this item can be represented on the server without a secret literal.
   * Phrase mode always needs text to match, so it is never publishable without that secret.
   */
  function isPublishableWithoutSecret(item) {
    if (!item || isLocalOnly(item)) return false;
    if (!hasSelectors(item)) return false;
    var mode = normalizeMode(item.mode);
    if (mode === MODES.REPLACE_PHRASE) return false;
    if (mode === MODES.REPLACE_REGEX_IN_ELEMENT) {
      return !!(item.regex && String(item.regex).trim());
    }
    if (mode === MODES.REPLACE_WHOLE_ELEMENT) return true;
    return false;
  }

  /**
   * One sanitized row for API (no text/pickedText/localOnly).
   */
  function sanitizePersonalInfoItemForPublishedSync(item) {
    if (!item || typeof item !== 'object') return null;
    var mode = normalizeMode(item.mode);
    var out = {
      selectors: Array.isArray(item.selectors) ? item.selectors : [],
      replacementWord: item.replacementWord != null ? item.replacementWord : item.replacement,
      mode: mode,
    };
    if (item.replacement != null && out.replacementWord == null) out.replacement = item.replacement;
    if (mode === MODES.REPLACE_REGEX_IN_ELEMENT && item.regex != null) out.regex = String(item.regex);
    return out;
  }

  /**
   * personalInfo array safe to send when wf.published (strips secrets; drops unusable rows).
   */
  function sanitizePersonalInfoArrayForPublishedSync(arr) {
    if (!Array.isArray(arr) || !arr.length) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it || isLocalOnly(it)) continue;
      if (isPublishableWithoutSecret(it)) {
        var s = sanitizePersonalInfoItemForPublishedSync(it);
        if (s && s.selectors && s.selectors.length) out.push(s);
      }
    }
    return out;
  }

  /**
   * Deep clone workflow for create/update API body. When published, redacts personalInfo.
   * @param {object} wf
   * @returns {object}
   */
  function cloneWorkflowForPublishedSync(wf) {
    var copy = JSON.parse(JSON.stringify(wf || {}));
    if (!copy.published) return copy;
    copy.personalInfo = sanitizePersonalInfoArrayForPublishedSync(copy.personalInfo);
    return copy;
  }

  function selectorsKey(item) {
    if (!hasSelectors(item)) return '';
    try {
      return JSON.stringify(item.selectors);
    } catch (e) {
      return '';
    }
  }

  /**
   * Merge server personalInfo with previous local list so plaintext phrases survive fetch.
   */
  function mergePersonalInfoFromFetch(remoteList, prevList) {
    var r = Array.isArray(remoteList) ? remoteList : [];
    var p = Array.isArray(prevList) ? prevList : [];
    if (!p.length) return r;
    var out = r.map(function (x) {
      return Object.assign({}, x);
    });
    for (var i = 0; i < p.length; i++) {
      var item = p[i];
      if (!item) continue;
      if (isLocalOnly(item)) {
        var dupLo = out.some(function (o) {
          return isLocalOnly(o) && selectorsKey(o) === selectorsKey(item) && (item.text || '') === (o.text || '');
        });
        if (!dupLo) out.push(Object.assign({}, item));
        continue;
      }
      var st = secretText(item);
      if (!st) continue;
      var sk = selectorsKey(item);
      var idx = -1;
      if (sk) {
        idx = out.findIndex(function (o) {
          return selectorsKey(o) === sk && normalizeMode(o.mode) === normalizeMode(item.mode);
        });
      } else {
        idx = out.findIndex(function (o) {
          return !hasSelectors(o) && (o.text || '').trim() === st;
        });
      }
      if (idx >= 0) {
        out[idx] = Object.assign({}, out[idx], {
          text: item.text,
          pickedText: item.pickedText,
        });
      } else {
        out.push(Object.assign({}, item));
      }
    }
    return out;
  }

  /**
   * Type/select steps: exact phrase replacement, then regex-in-element rules for the focused control.
   * @param {*} value
   * @param {Element|null|undefined} element
   * @param {Array} personalInfo
   * @param {function(Array, Document): Element|null|undefined} resolveElement
   * @param {Document} doc
   * @returns {string}
   */
  function applyToTypedValue(value, element, personalInfo, resolveElement, doc) {
    if (value == null || !personalInfo || !personalInfo.length) return value;
    var str = String(value);
    var trimmed = str.trim();
    var i;
    for (i = 0; i < personalInfo.length; i++) {
      var p = personalInfo[i];
      if (!p || !p.text) continue;
      if (str === p.text || trimmed === String(p.text).trim()) {
        if (p.replacementWord != null || p.replacement != null) {
          return p.replacementWord != null ? p.replacementWord : p.replacement;
        }
        return str;
      }
    }
    if (!element || typeof resolveElement !== 'function' || !doc) return str;
    var out = str;
    for (i = 0; i < personalInfo.length; i++) {
      var q = personalInfo[i];
      if (!q) continue;
      if (normalizeMode(q.mode) !== MODES.REPLACE_REGEX_IN_ELEMENT || !q.regex) continue;
      if (!hasSelectors(q)) continue;
      var resolved;
      try {
        resolved = resolveElement(q.selectors, doc);
      } catch (e) {
        resolved = null;
      }
      if (resolved !== element) continue;
      try {
        var re = new RegExp(q.regex, 'g');
        var rw = q.replacementWord != null ? q.replacementWord : q.replacement;
        if (rw == null) rw = '***';
        out = String(out).replace(re, rw);
      } catch (e2) {}
    }
    return out;
  }

  global.CFS_personalInfoSync = {
    MODES: MODES,
    normalizeMode: normalizeMode,
    hasSelectors: hasSelectors,
    secretText: secretText,
    isLocalOnly: isLocalOnly,
    isPublishableWithoutSecret: isPublishableWithoutSecret,
    sanitizePersonalInfoItemForPublishedSync: sanitizePersonalInfoItemForPublishedSync,
    sanitizePersonalInfoArrayForPublishedSync: sanitizePersonalInfoArrayForPublishedSync,
    cloneWorkflowForPublishedSync: cloneWorkflowForPublishedSync,
    mergePersonalInfoFromFetch: mergePersonalInfoFromFetch,
    applyToTypedValue: applyToTypedValue,
  };
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
