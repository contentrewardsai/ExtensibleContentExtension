(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscTransferBep20', {
    label: 'BSC transfer BEP-20',
    defaultAction: {
      type: 'bscTransferBep20',
      runIf: '',
      token: '',
      to: '',
      amount: '',
      deadline: '',
      waitConfirmations: 1,
      gasLimit: '',
      saveTxHashVariable: 'bscTxHash',
      saveExplorerUrlVariable: 'bscExplorerUrl',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var tok = (action.token || '').toString().trim();
      if (tok) return 'BEP-20 ' + tok.slice(0, 8) + '…';
      return 'BSC transfer BEP-20';
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
