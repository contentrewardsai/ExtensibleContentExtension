(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscAggregatorSwap', {
    label: 'BSC aggregator swap (ParaSwap)',
    defaultAction: {
      type: 'bscAggregatorSwap',
      runIf: '',
      srcToken: 'native',
      destToken: '',
      side: 'SELL',
      amount: '',
      slippage: '150',
      waitConfirmations: 1,
      gasLimit: '',
      saveTxHashVariable: 'bscTxHash',
      saveExplorerUrlVariable: 'bscExplorerUrl',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var s = (action.side || 'SELL').toString().trim();
      return 'BSC ParaSwap · ' + s;
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
