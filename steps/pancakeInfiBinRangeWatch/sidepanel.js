(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('pancakeInfiBinRangeWatch', {
    label: 'PancakeSwap Infinity bin range watch',
    defaultAction: {
      type: 'pancakeInfiBinRangeWatch',
      runIf: '',
      infiPositionTokenId: '',
      poolId: '',
      infiLowerBinId: '',
      infiUpperBinId: '',
      pollIntervalMs: 30000,
      timeoutMs: 0,
      saveDriftDirection: 'driftDirection',
      saveActiveBin: 'activeBinId',
      savePositionRange: 'positionRange',
    },
    getSummary: function(action) {
      var tid = (action.infiPositionTokenId || '').toString().trim();
      if (tid) return 'Watch Infinity bin #' + tid;
      var lo = (action.infiLowerBinId || '').toString().trim();
      var hi = (action.infiUpperBinId || '').toString().trim();
      if (lo && hi) return 'Watch bins [' + lo + ', ' + hi + ']';
      return 'PancakeSwap Infinity bin range watch';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var d = (action.saveDriftDirection || '').trim();
      if (d) out.push({ rowKey: d, label: d, hint: 'above or below' });
      var b = (action.saveActiveBin || '').trim();
      if (b) out.push({ rowKey: b, label: b, hint: 'active bin id' });
      var r = (action.savePositionRange || '').trim();
      if (r) out.push({ rowKey: r, label: r, hint: 'range JSON' });
      return out;
    },
  });
})();
