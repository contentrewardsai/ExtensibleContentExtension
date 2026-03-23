/**
 * Merge per-step selector chains when two workflows target the same DOM node (live-tab check in player).
 * Reuses analyzer mergeSelectors when available (shared/analyzer.js).
 */
(function (global) {
  'use strict';

  function mergeSelectorsList(selectors) {
    if (typeof global.mergeSelectors === 'function') {
      return global.mergeSelectors(selectors);
    }
    var byKey = new Map();
    for (var i = 0; i < (selectors || []).length; i++) {
      var s = selectors[i];
      if (!s || !s.type) continue;
      try {
        var key = s.type + ':' + JSON.stringify(s.value);
        var existing = byKey.get(key);
        if (!existing || (s.score || 0) > (existing.score || 0)) {
          byKey.set(key, Object.assign({}, s));
        }
      } catch (_) {}
    }
    return Array.from(byKey.values()).sort(function (a, b) {
      return (b.score || 0) - (a.score || 0);
    });
  }

  /**
   * Keep canonical primary selectors; union fallbacks with donor's primary+fallbacks (dedupe, score order).
   */
  function mergeFallbackChainsForSameElement(canonicalAction, donorAction) {
    if (!canonicalAction || !donorAction) return null;
    var merged = JSON.parse(JSON.stringify(canonicalAction));
    if (merged.type === 'ensureSelect') {
      var combinedEs = (canonicalAction.fallbackSelectors || []).concat(
        donorAction.checkSelectors || [],
        donorAction.openSelectors || [],
        donorAction.fallbackSelectors || []
      );
      merged.fallbackSelectors = mergeSelectorsList(combinedEs);
      return merged;
    }
    var combined = (canonicalAction.fallbackSelectors || []).concat(
      donorAction.selectors || [],
      donorAction.fallbackSelectors || []
    );
    merged.fallbackSelectors = mergeSelectorsList(combined);
    return merged;
  }

  global.CFS_crossWorkflowSelectors = {
    mergeSelectorsList: mergeSelectorsList,
    mergeFallbackChainsForSameElement: mergeFallbackChainsForSameElement,
  };
})(typeof window !== 'undefined' ? window : globalThis);
