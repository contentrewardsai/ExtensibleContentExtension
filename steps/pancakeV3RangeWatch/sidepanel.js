(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('pancakeV3RangeWatch', {
    label: 'PancakeSwap V3 range watch',
    defaultAction: {
      type: 'pancakeV3RangeWatch',
      runIf: '',
      v3PositionTokenId: '',
      pollIntervalMs: 30000,
      timeoutMs: 0,
      saveDriftDirection: 'driftDirection',
      saveCurrentTick: 'currentTick',
      savePositionRange: 'positionRange',
    },
    getSummary: function(action) {
      var tid = (action.v3PositionTokenId || '').toString().trim();
      return tid ? 'Watch V3 #' + tid : 'PancakeSwap V3 range watch';
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
