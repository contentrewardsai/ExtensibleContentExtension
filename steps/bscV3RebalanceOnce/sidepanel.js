(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscV3RebalanceOnce', {
    label: 'BSC V3 rebalance once',
    defaultAction: {
      type: 'bscV3RebalanceOnce',
      runIf: '',
      v3PositionTokenId: '',
      v3Pool: '',
      v3Fee: '',
      rangePercent: '1',
      driftDirection: '{{driftDirection}}',
      slippageBps: '50',
      bnbBudgetWei: 'max',
      gasReserveWei: '',
      gasLimit: '',
      burnPosition: true,
      ensureApprovals: true,
      swapRouterV3Address: '',
      positionManagerAddress: '',
      saveV3PositionTokenIdVariable: 'v3PositionTokenId',
      saveTickLower: 'tickLower',
      saveTickUpper: 'tickUpper',
      saveMinPrice: 'minPrice',
      saveMaxPrice: 'maxPrice',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var tid = (action.v3PositionTokenId || '').toString().trim();
      return tid ? 'Rebalance V3 #' + tid : 'BSC V3 rebalance once';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var nft = (action.saveV3PositionTokenIdVariable || '').trim();
      if (nft) out.push({ rowKey: nft, label: nft, hint: 'new NFT id' });
      ['saveTickLower', 'saveTickUpper', 'saveMinPrice', 'saveMaxPrice'].forEach(function(k) {
        var rk = (action[k] || '').trim();
        if (rk) out.push({ rowKey: rk, label: rk, hint: k.replace(/^save/, '') });
      });
      return out;
    },
  });
})();
