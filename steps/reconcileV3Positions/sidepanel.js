(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('reconcileV3Positions', {
    label: 'Reconcile V3 positions',
    defaultAction: {
      type: 'reconcileV3Positions',
      runIf: '',
      workflowId: 'wf-bsc-v3-monitor',
      autoTrackNew: false,
      everyNTicks: 10,
      saveResultVariable: 'v3ReconcileResult',
    },
    getSummary: function (action) {
      var id = (action.workflowId || '').toString().trim() || 'wf-bsc-v3-monitor';
      return 'Reconcile V3 NFTs → ' + id;
    },
    getVariableKey: function () { return ''; },
    getVariableHint: function () { return ''; },
    getExtraVariableKeys: function (action) {
      var out = [];
      var s = (action.saveResultVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'reconcile JSON' });
      return out;
    },
  });
})();
