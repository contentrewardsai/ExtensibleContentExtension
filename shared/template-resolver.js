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

  if (typeof global !== 'undefined') {
    global.CFS_templateResolver = { resolveTemplate: resolveTemplate, getByPath: getByPath };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);
