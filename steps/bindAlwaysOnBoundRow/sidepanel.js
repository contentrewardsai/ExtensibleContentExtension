(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bindAlwaysOnBoundRow', {
    label: 'Bind always-on boundRow',
    defaultAction: {
      type: 'bindAlwaysOnBoundRow',
      runIf: '',
      targetWorkflowId: 'wf-bsc-v3-monitor',
      fieldMap: {
        v3PositionTokenId: '{{v3PositionTokenId}}',
        v3Pool: '{{v3Pool}}',
        exitBelowPolicy: '{{exitBelowPolicy}}',
        exitAbovePolicy: '{{exitAbovePolicy}}',
        stableToken: '{{stableToken}}',
        rangePercent: '{{rangePercent}}',
      },
      enablePriceRangeWatch: true,
      pollIntervalMs: '30000',
      saveBoundRowVariable: 'alwaysOnBoundRow',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var id = (action.targetWorkflowId || '').toString().trim();
      return id ? 'Bind boundRow → ' + id : 'Bind always-on boundRow';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s = (action.saveBoundRowVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'merged boundRow JSON' });
      return out;
    },
  });
})();
