/**
 * Assert Condition — halt workflow if condition evaluates to false.
 * Reuses CFS_runIfCondition.evaluate() for the expression engine.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('assertCondition', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (assertCondition)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var condition = (action.condition || '').trim();
    if (!condition) throw new Error('Assert Condition: no condition specified.');

    /* Evaluate the condition using the same engine as runIf */
    var result = false;
    if (typeof CFS_runIfCondition !== 'undefined' && typeof CFS_runIfCondition.evaluate === 'function') {
      result = CFS_runIfCondition.evaluate(condition, row, getRowValue);
    } else {
      /* Fallback: treat as simple variable truthiness check */
      var val = getRowValue(row, condition.replace(/^\{\{\s*|\s*\}\}$/g, '').trim());
      result = !!(val && val !== '' && val !== 0 && val !== false);
    }

    if (result) return; /* condition passed — continue workflow */

    /* Condition failed — resolve error message template and halt */
    var errorMsg = (action.errorMessage || '').trim() || 'Assert failed: condition is false';
    if (typeof CFS_templateResolver !== 'undefined' && typeof CFS_templateResolver.resolveTemplate === 'function') {
      errorMsg = CFS_templateResolver.resolveTemplate(String(errorMsg), row, getRowValue, action);
    }
    throw new Error(errorMsg);
  }, { needsElement: false });
})();
