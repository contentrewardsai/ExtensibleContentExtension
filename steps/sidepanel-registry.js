/**
 * Sidepanel step registry. Step plugins (steps/<id>/sidepanel.js) call register() to add
 * their label, defaultAction, getSummary, and optionally renderBody/saveStep.
 * Loaded by sidepanel before step scripts so the registry exists.
 */
;(function() {
  'use strict';
  window.__CFS_stepSidepanels = window.__CFS_stepSidepanels || {};
  window.__CFS_sidepanelStepsReady = false;

  /**
   * Merge discovery hint objects (from each steps/{id}/discovery.json) into one list, skipping duplicates by JSON shape.
   * Used by sidepanel-loader and project-folder discovery loading.
   */
  window.__CFS_mergeDiscoveryStepHintLists = function(existing, incoming) {
    var out = Array.isArray(existing) ? existing.slice() : [];
    if (!Array.isArray(incoming)) return out;
    var seen = new Set();
    for (var i = 0; i < out.length; i++) {
      try {
        seen.add(JSON.stringify(out[i]));
      } catch (_) {}
    }
    for (var j = 0; j < incoming.length; j++) {
      var item = incoming[j];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      var k;
      try {
        k = JSON.stringify(item);
      } catch (_) {
        continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  };

  window.__CFS_registerStepSidepanel = function(id, spec) {
    if (!id || typeof id !== 'string') return;
    window.__CFS_stepSidepanels[id] = {
      label: spec.label != null ? spec.label : id,
      defaultAction: spec.defaultAction != null ? spec.defaultAction : { type: id },
      getSummary: typeof spec.getSummary === 'function' ? spec.getSummary : null,
      renderBody: typeof spec.renderBody === 'function' ? spec.renderBody : null,
      saveStep: typeof spec.saveStep === 'function' ? spec.saveStep : null,
      getVariableKey: typeof spec.getVariableKey === 'function' ? spec.getVariableKey : null,
      getVariableHint: typeof spec.getVariableHint === 'function' ? spec.getVariableHint : null,
      getExtraVariableKeys: typeof spec.getExtraVariableKeys === 'function' ? spec.getExtraVariableKeys : null,
      mergeInto: typeof spec.mergeInto === 'function' ? spec.mergeInto : null,
      getSimilarityScore: typeof spec.getSimilarityScore === 'function' ? spec.getSimilarityScore : null,
      handlesOwnWait: spec.handlesOwnWait === true,
      shortcutLabel: spec.shortcutLabel != null ? spec.shortcutLabel : null,
      shortcutDefaultAction: spec.shortcutDefaultAction != null ? spec.shortcutDefaultAction : null,
    };
  };
})();
