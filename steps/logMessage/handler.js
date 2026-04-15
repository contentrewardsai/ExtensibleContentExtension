/**
 * Log Message — write a resolved template message to the browser console.
 * Uses CFS_templateResolver.resolveTemplate() for {{variable}} substitution.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('logMessage', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (logMessage)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var message = action.message != null ? String(action.message) : '';
    if (typeof CFS_templateResolver !== 'undefined' && typeof CFS_templateResolver.resolveTemplate === 'function') {
      message = CFS_templateResolver.resolveTemplate(message, row, getRowValue, action);
    }

    var level = (action.level || 'info').toLowerCase();
    var prefix = '[CFS Workflow]';
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }

    /* Optionally save resolved message to a row variable */
    var saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = message;
    }
  }, { needsElement: false });
})();
