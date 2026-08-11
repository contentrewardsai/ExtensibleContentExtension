(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscV3LpWizard', {
    label: 'BSC V3 LP wizard',
    defaultAction: {
      type: 'bscV3LpWizard',
      runIf: '',
      tokenA: '',
      tokenB: '',
      v3Fee: '500',
      v3Pool: '0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4',
      rangePercent: '0.5',
      minPrice: '',
      maxPrice: '',
      bnbBudgetWei: 'max',
      gasReserveWei: '',
      stableToken: '0x55d398326f99059fF775485246999027B3197955',
      exitBelowPolicy: 'sell_stable',
      exitAbovePolicy: 'restake',
      slippageBps: '50',
      previewAmounts: true,
      saveTokenA: 'tokenA',
      saveTokenB: 'tokenB',
      saveV3Fee: 'v3Fee',
      saveV3Pool: 'v3Pool',
      saveRangePercent: 'rangePercent',
      saveMinPrice: 'minPrice',
      saveMaxPrice: 'maxPrice',
      saveTickLower: 'tickLower',
      saveTickUpper: 'tickUpper',
      saveBnbBudgetWei: 'bnbBudgetWei',
      saveAmount0Desired: 'amount0Desired',
      saveAmount1Desired: 'amount1Desired',
      saveStableToken: 'stableToken',
      saveExitBelowPolicy: 'exitBelowPolicy',
      saveExitAbovePolicy: 'exitAbovePolicy',
      saveSlippageBps: 'slippageBps',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var pool = (action.v3Pool || '').toString().trim();
      if (pool) return 'V3 LP wizard ' + pool.slice(0, 8) + '…';
      var a = (action.tokenA || '').toString().trim();
      var b = (action.tokenB || '').toString().trim();
      if (a && b) return 'V3 LP wizard ' + a.slice(0, 6) + '…/' + b.slice(0, 6) + '…';
      return 'BSC V3 LP wizard';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        'saveTokenA', 'saveTokenB', 'saveV3Fee', 'saveV3Pool', 'saveRangePercent',
        'saveMinPrice', 'saveMaxPrice', 'saveTickLower', 'saveTickUpper',
        'saveBnbBudgetWei', 'saveAmount0Desired', 'saveAmount1Desired',
        'saveStableToken', 'saveExitBelowPolicy', 'saveExitAbovePolicy', 'saveSlippageBps',
      ];
      var out = [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var rowKey = (action[k] || '').trim();
        if (rowKey) out.push({ rowKey: rowKey, label: rowKey, hint: k.replace(/^save/, '') });
      }
      return out;
    },
  });
})();
