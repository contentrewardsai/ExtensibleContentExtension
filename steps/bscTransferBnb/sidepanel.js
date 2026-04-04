(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscTransferBnb', {
    label: 'BSC transfer BNB',
    defaultAction: {
      type: 'bscTransferBnb',
      runIf: '',
      to: '',
      ethWei: '',
      deadline: '',
      waitConfirmations: 1,
      gasLimit: '',
      saveTxHashVariable: 'bscTxHash',
      saveExplorerUrlVariable: 'bscExplorerUrl',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var t = (action.to || '').toString().trim();
      if (t) return 'BNB → ' + t.slice(0, 8) + '…';
      return 'BSC transfer BNB';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveTxHashVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx hash' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      return out;
    },
  });
})();
