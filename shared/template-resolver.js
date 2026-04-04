/**
 * Template substitution utilities: {{variableName}} in strings.
 * Used by sendToEndpoint, runGenerator, and other steps that support row variable substitution.
 */
(function (global) {
  'use strict';

  /**
   * Replace {{ varName }} in str with getRowValue(row, varName).
   * Special: {{stepCommentText}}, {{stepCommentSummary}} use action.comment when action is provided.
   * @param {string} str - Template string
   * @param {Object} row - Row object
   * @param {function} getRowValue - (row, ...keys) => value
   * @param {Object} [action] - Optional step action for stepCommentText/stepCommentSummary
   * @returns {string}
   */
  function resolveTemplate(str, row, getRowValue, action) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = String(key).trim();
      if (action && k === 'stepCommentText') {
        if (global.CFS_stepComment && typeof global.CFS_stepComment.getStepCommentFullText === 'function') {
          return global.CFS_stepComment.getStepCommentFullText(action.comment || {});
        }
        return (action.comment && action.comment.text) ? String(action.comment.text) : '';
      }
      if (action && k === 'stepCommentSummary') {
        if (global.CFS_stepComment && typeof global.CFS_stepComment.getStepCommentSummary === 'function') {
          return global.CFS_stepComment.getStepCommentSummary(action.comment || {}, 120);
        }
        var text = (action.comment && action.comment.text) ? String(action.comment.text) : '';
        return text.length > 120 ? text.slice(0, 120) + '\u2026' : text;
      }
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  /**
   * Get nested value from obj by dot path, e.g. "data.id" -> obj.data.id
   */
  function getByPath(obj, pathStr) {
    if (!pathStr || typeof pathStr !== 'string') return obj;
    var parts = pathStr.trim().split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }

  /**
   * If value is a JSON object/array string, parse; otherwise return as-is.
   */
  function tryParseJsonString(v) {
    if (typeof v !== 'string') return v;
    var t = v.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return v;
    try {
      return JSON.parse(t);
    } catch (_) {
      return v;
    }
  }

  /**
   * Token path: dot-separated keys and [n] array indices, e.g. "data.items[0].id"
   */
  function tokenizeLoosePath(pathStr) {
    var tokens = [];
    var s = String(pathStr || '').trim();
    var i = 0;
    while (i < s.length) {
      if (s[i] === '.' || s[i] === ' ') {
        i++;
        continue;
      }
      if (s[i] === '[') {
        var j = s.indexOf(']', i);
        if (j === -1) break;
        var n = parseInt(s.slice(i + 1, j), 10);
        if (!isNaN(n)) tokens.push({ type: 'index', value: n });
        i = j + 1;
        continue;
      }
      var j = i;
      while (j < s.length && s[j] !== '.' && s[j] !== '[' && s[j] !== ' ') j++;
      var name = s.slice(i, j).trim();
      if (name) tokens.push({ type: 'key', value: name });
      i = j;
    }
    return tokens;
  }

  /**
   * Walk obj using dot + bracket segments; JSON-parse string intermediates when descending deeper.
   */
  function getByLoosePath(obj, pathStr) {
    if (pathStr == null || String(pathStr).trim() === '') return obj;
    var tokens = tokenizeLoosePath(pathStr);
    if (tokens.length === 0) return obj;
    var cur = obj;
    for (var ti = 0; ti < tokens.length; ti++) {
      if (cur == null) return undefined;
      if (ti > 0 && typeof cur === 'string') cur = tryParseJsonString(cur);
      var tok = tokens[ti];
      cur = tok.type === 'index' ? cur[tok.value] : cur[tok.value];
    }
    return cur;
  }

  if (typeof global !== 'undefined') {
    global.CFS_templateResolver = {
      resolveTemplate: resolveTemplate,
      getByPath: getByPath,
      tryParseJsonString: tryParseJsonString,
      tokenizeLoosePath: tokenizeLoosePath,
      getByLoosePath: getByLoosePath,
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);
