(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('raydiumClmmRangeWatch', {
    label: 'Raydium CLMM range watch',
    defaultAction: {
      type: 'raydiumClmmRangeWatch',
      runIf: '',
      poolId: '',
      positionNftMint: '',
      pollIntervalMs: 30000,
      timeoutMs: 0,
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveDriftDirection: 'driftDirection',
      saveCurrentTick: 'currentTick',
      savePositionRange: 'positionRange',
    },
    getSummary: function(action) {
      var pool = (action.poolId || '').toString().trim();
      return pool ? 'Watch CLMM ' + pool.slice(0, 8) + '…' : 'CLMM range watch';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var d = (action.saveDriftDirection || '').trim();
      if (d) out.push({ rowKey: d, label: d, hint: 'above or below' });
      var t = (action.saveCurrentTick || '').trim();
      if (t) out.push({ rowKey: t, label: t, hint: 'current tick' });
      var r = (action.savePositionRange || '').trim();
      if (r) out.push({ rowKey: r, label: r, hint: 'range JSON' });
      return out;
    },
  });
})();
