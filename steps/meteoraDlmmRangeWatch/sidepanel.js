(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('meteoraDlmmRangeWatch', {
    label: 'Meteora DLMM range watch',
    defaultAction: {
      type: 'meteoraDlmmRangeWatch',
      runIf: '',
      lbPair: '',
      position: '',
      pollIntervalMs: 30000,
      timeoutMs: 0,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveDriftDirection: 'driftDirection',
      saveActiveBin: 'activeBin',
      savePositionRange: 'positionRange',
    },
    getSummary: function(action) {
      var pool = (action.lbPair || '').toString().trim();
      return pool ? 'Watch DLMM ' + pool.slice(0, 8) + '…' : 'DLMM range watch';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var d = (action.saveDriftDirection || '').trim();
      if (d) out.push({ rowKey: d, label: d, hint: 'above or below' });
      var b = (action.saveActiveBin || '').trim();
      if (b) out.push({ rowKey: b, label: b, hint: 'active bin ID' });
      var r = (action.savePositionRange || '').trim();
      if (r) out.push({ rowKey: r, label: r, hint: 'range JSON' });
      return out;
    },
    /* Uses formSchema-based auto-rendering from step.json — no custom renderBody needed */
  });
})();
