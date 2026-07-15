/**
 * Strip removed step types from stored workflows (Generator / UploadPost / ShotStack).
 */
(function (global) {
  'use strict';

  function getRemovedSet() {
    return global.CFS_removedStepTypes instanceof Set ? global.CFS_removedStepTypes : new Set();
  }

  function getWorkflowActions(wf) {
    if (!wf || typeof wf !== 'object') return null;
    if (wf.analyzed && Array.isArray(wf.analyzed.actions)) return wf.analyzed.actions;
    if (Array.isArray(wf.actions)) return wf.actions;
    return null;
  }

  function setWorkflowActions(wf, actions) {
    if (!wf || typeof wf !== 'object') return;
    if (wf.analyzed && Array.isArray(wf.analyzed.actions)) {
      wf.analyzed.actions = actions;
    } else if (Array.isArray(wf.actions)) {
      wf.actions = actions;
    } else if (wf.analyzed && typeof wf.analyzed === 'object') {
      wf.analyzed.actions = actions;
    } else {
      wf.actions = actions;
    }
  }

  /**
   * @param {Array<object>} actions
   * @returns {{ actions: Array<object>, removedCount: number, types: string[] }}
   */
  function stripRemovedStepsFromActions(actions) {
    var removed = getRemovedSet();
    var removedCount = 0;
    var types = [];
    var out = [];

    for (var i = 0; i < (actions || []).length; i++) {
      var a = actions[i];
      if (!a || typeof a !== 'object') continue;
      if (removed.has(a.type)) {
        removedCount++;
        if (types.indexOf(a.type) === -1) types.push(a.type);
        continue;
      }
      var copy = Object.assign({}, a);
      if (a.type === 'loop' && Array.isArray(a.steps)) {
        var nested = stripRemovedStepsFromActions(a.steps);
        copy.steps = nested.actions;
        removedCount += nested.removedCount;
        for (var t = 0; t < nested.types.length; t++) {
          if (types.indexOf(nested.types[t]) === -1) types.push(nested.types[t]);
        }
      }
      out.push(copy);
    }

    return { actions: out, removedCount: removedCount, types: types };
  }

  /**
   * Mutates workflows in place.
   * @param {Record<string, object>} workflows
   * @returns {{ report: Array<{ id: string, name: string, removedCount: number, types: string[] }> }}
   */
  function migrateWorkflowsRemovedSteps(workflows) {
    var report = [];
    if (!workflows || typeof workflows !== 'object') return { report: report };

    Object.keys(workflows).forEach(function (id) {
      var wf = workflows[id];
      if (!wf || typeof wf !== 'object') return;
      var actions = getWorkflowActions(wf);
      if (!actions || !actions.length) return;
      var result = stripRemovedStepsFromActions(actions);
      if (result.removedCount <= 0) return;
      setWorkflowActions(wf, result.actions);
      wf._removedStepsMigratedAt = new Date().toISOString();
      wf._removedStepsMigratedCount = result.removedCount;
      report.push({
        id: wf.id || id,
        name: wf.name || id,
        removedCount: result.removedCount,
        types: result.types,
      });
    });

    return { report: report };
  }

  global.CFS_workflowRemovedStepsMigration = {
    stripRemovedStepsFromActions: stripRemovedStepsFromActions,
    migrateWorkflowsRemovedSteps: migrateWorkflowsRemovedSteps,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
