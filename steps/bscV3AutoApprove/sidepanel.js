(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscV3AutoApprove', {
    label: 'BSC V3 auto-approve',
    defaultAction: {
      type: 'bscV3AutoApprove',
      runIf: '',
      tokenA: '',
      tokenB: '',
      swapRouterV3Address: '',
      positionManagerAddress: '',
      amount: 'max',
      gasLimit: '',
      saveApproveResultsVariable: 'v3ApproveResults',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var a = (action.tokenA || '').toString().trim();
      var b = (action.tokenB || '').toString().trim();
      if (a && b) return 'V3 approve ' + a.slice(0, 6) + '…/' + b.slice(0, 6) + '…';
      return 'BSC V3 auto-approve';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s = (action.saveApproveResultsVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'approve results JSON' });
      return out;
    },
  });
})();
