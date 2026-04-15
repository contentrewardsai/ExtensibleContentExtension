/**
 * Set Variables — set row variables from template expressions with auto-coercion.
 * Simpler alternative to rowSetFields for common patterns.
 */
(function() {
  'use strict';

  /**
   * Auto-coerce string values: "true"→true, "false"→false, numeric→number.
   * Non-string values pass through untouched.
   */
  function autoCoerce(val) {
    if (typeof val !== 'string') return val;
    var trimmed = val.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === '') return '';
    /* Try numeric coercion */
    var n = Number(trimmed);
    if (trimmed !== '' && Number.isFinite(n)) return n;
    return val;
  }

  window.__CFS_registerStepHandler('setBatchVariable', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (setBatchVariable)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var assignments = action.assignments;
    if (assignments == null) return;
    if (typeof assignments === 'string') {
      try {
        assignments = JSON.parse(assignments || '[]');
      } catch (e) {
        throw new Error('Set Variables: assignments must be a valid JSON array');
      }
    }
    if (!Array.isArray(assignments)) throw new Error('Set Variables: assignments must be an array');
    if (!assignments.length) return;

    var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && typeof CFS_templateResolver.resolveTemplate === 'function')
      ? CFS_templateResolver.resolveTemplate
      : null;

    for (var i = 0; i < assignments.length; i++) {
      var entry = assignments[i];
      if (!entry || typeof entry !== 'object') continue;
      var varName = String(entry.variable || entry.var || entry.key || '').trim();
      if (!varName) {
        throw new Error('Set Variables: assignment #' + (i + 1) + ' missing "variable" name');
      }
      var rawValue = entry.value != null ? entry.value : '';

      /* Resolve template if it's a string with {{}} */
      var resolved;
      if (typeof rawValue === 'string' && resolveTemplate) {
        resolved = resolveTemplate(String(rawValue), row, getRowValue, action);
      } else {
        resolved = rawValue;
      }

      /* Auto-coerce string results */
      row[varName] = autoCoerce(resolved);
    }
  }, { needsElement: false });
})();
