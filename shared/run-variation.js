/**
 * Run variation analysis: compare runs to understand selector stability,
 * step ordering, and which steps are necessary vs optional.
 * Requires: shared/selectors.js, shared/analyzer.js (for alignRunsBySimilarity, actionSimilarity, getRunIndexForAction)
 */
(function(global) {
  'use strict';

  const sim = typeof actionSimilarity === 'function' ? actionSimilarity : () => 0;
  const getRunIndexForAction = typeof global.getRunIndexForAction === 'function'
    ? global.getRunIndexForAction
    : function(action, runActions) {
        for (let r = 0; r < runActions.length; r++) {
          if ((runActions[r] || []).includes(action)) return r;
        }
        return -1;
      };

  const computeSelectorStabilityFromActionsWithRuns = typeof global.computeSelectorStabilityFromActionsWithRuns === 'function'
    ? global.computeSelectorStabilityFromActionsWithRuns
    : function() { return []; };

  function selectorStability(actionsWithRuns) {
    return computeSelectorStabilityFromActionsWithRuns(actionsWithRuns || []);
  }

  /**
   * Compute step order variance: for each run, what was the index of this step?
   */
  function stepOrderVariance(aligned, runActions, actionToRun) {
    const runIndices = []; // runIndices[col][run] = step index in that run, or -1
    for (let c = 0; c < aligned.length; c++) {
      const col = aligned[c] || [];
      const indices = {};
      for (let r = 0; r < runActions.length; r++) {
        indices[r] = -1;
      }
      for (const a of col) {
        if (!a) continue;
        const runIdx = actionToRun.get(a) ?? getRunIndexForAction(a, runActions);
        if (runIdx >= 0) {
          const arr = runActions[runIdx] || [];
          indices[runIdx] = arr.indexOf(a);
        }
      }
      runIndices.push(indices);
    }
    return runIndices;
  }

  /**
   * Main entry: analyze run variations.
   * @param {Array} runs - Array of run objects with .actions
   * @param {Object} opts - { aligned, merged } - if provided, skip re-computation
   * @returns {Object} variation report
   */
  function analyzeRunVariations(runs, opts = {}) {
    if (!runs?.length) return null;
    const runActions = runs.map(r => (r?.actions || []).filter(Boolean));
    if (!runActions.some(arr => arr.length > 0)) return null;

    let aligned = opts.aligned;
    if (!aligned && typeof alignRunsBySimilarity === 'function') {
      aligned = alignRunsBySimilarity(runActions);
    }
    if (!aligned?.length) return null;

    const refIdx = runActions.reduce((best, arr, i) =>
      (arr.length >= (runActions[best]?.length || 0) ? i : best), 0);
    const runCount = runActions.length;

    const actionToRun = new Map();
    for (let c = 0; c < aligned.length; c++) {
      const col = aligned[c] || [];
      for (const a of col) {
        if (!a) continue;
        const ri = getRunIndexForAction(a, runActions);
        if (ri >= 0) actionToRun.set(a, ri);
      }
    }

    const stepReports = [];
    for (let c = 0; c < aligned.length; c++) {
      const col = aligned[c] || [];
      const actionsWithRuns = col
        .filter(Boolean)
        .map(a => ({ action: a, runIdx: actionToRun.get(a) ?? getRunIndexForAction(a, runActions) }))
        .filter(x => x.runIdx >= 0);

      const runIndices = {};
      for (const { action, runIdx } of actionsWithRuns) {
        const arr = runActions[runIdx] || [];
        runIndices[runIdx] = arr.indexOf(action);
      }

      const stability = selectorStability(actionsWithRuns);
      const presentRuns = actionsWithRuns.map(x => x.runIdx);
      const optional = presentRuns.length < runCount;

      stepReports.push({
        columnIndex: c,
        runCount: presentRuns.length,
        totalRuns: runCount,
        optional,
        presentInRuns: presentRuns,
        absentFromRuns: [...Array(runCount).keys()].filter(r => !presentRuns.includes(r)),
        runIndices,
        selectorStability: stability,
        stableSelectors: stability.filter(s => s.stability >= 0.5),
        unstableSelectors: stability.filter(s => s.stability < 0.5),
        primaryAction: col[0] || null,
        type: col[0]?.type || 'unknown',
      });
    }

    const orderVariance = stepOrderVariance(aligned, runActions, actionToRun);
    let orderStable = true;
    for (let i = 0; i < orderVariance.length && orderStable; i++) {
      for (let j = i + 1; j < orderVariance.length; j++) {
        const indI = orderVariance[i] || {};
        const indJ = orderVariance[j] || {};
        for (let r = 0; r < runCount; r++) {
          const vi = indI[r];
          const vj = indJ[r];
          if (vi >= 0 && vj >= 0 && vi >= vj) {
            orderStable = false;
            break;
          }
        }
      }
    }

    return {
      runCount,
      stepCount: aligned.length,
      stepReports,
      orderVariance,
      orderStable,
      optionalCount: stepReports.filter(s => s.optional).length,
      requiredCount: stepReports.filter(s => !s.optional).length,
    };
  }

  if (typeof global !== 'undefined') {
    global.analyzeRunVariations = analyzeRunVariations;
    global.selectorStability = selectorStability;
  }
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
