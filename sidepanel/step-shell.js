/**
 * Step accordion shell helpers (runIf chip + persist).
 * Full __CFS_buildStepItemShell remains in sidepanel.js and assigns this chip helper.
 */
(function (global) {
  'use strict';

  function runIfChipHtml(action, escapeHtml) {
    var runIf = action && action.runIf ? String(action.runIf).trim() : '';
    if (!runIf) return '';
    var label = runIf.length > 40 ? runIf.slice(0, 40) + '…' : runIf;
    return '<span class="step-chip step-chip-runif" title="' + escapeHtml(runIf) + '">If ' + escapeHtml(label) + '</span>';
  }

  global.CFS_stepShell = { runIfChipHtml: runIfChipHtml };
})(typeof window !== 'undefined' ? window : globalThis);
