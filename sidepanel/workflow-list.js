/**
 * Workflow list helpers: child workflowId scan for the calls: line.
 */
(function (global) {
  'use strict';

  function collectWorkflowCallIds(w) {
    var ids = [];
    function walk(actions) {
      if (!Array.isArray(actions)) return;
      actions.forEach(function (a) {
        if (!a || typeof a !== 'object') return;
        if (a.workflowId) ids.push(String(a.workflowId));
        if (a.type === 'loop') walk(a.steps);
        if (a.type === 'ifCondition') {
          walk(a.thenSteps);
          walk(a.elseSteps);
        }
      });
    }
    walk(w && w.analyzed && w.analyzed.actions);
    var oor = w && w.alwaysOn && w.alwaysOn.priceRangeWatch && w.alwaysOn.priceRangeWatch.onOutOfRange;
    if (Array.isArray(oor)) {
      oor.forEach(function (r) { if (r && r.workflowId) ids.push(String(r.workflowId)); });
    }
    return ids.filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
  }

  global.CFS_workflowList = { collectWorkflowCallIds: collectWorkflowCallIds };
})(typeof window !== 'undefined' ? window : globalThis);
