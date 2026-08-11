(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscV3EnterFromStable', {
    label: 'BSC V3 enter from stable',
    defaultAction: {
      type: 'bscV3EnterFromStable',
      runIf: '',
      tokenA: '0x0A43fC31a73013089DF59194872Ecae4cAe14444',
      tokenB: '0x55d398326f99059fF775485246999027B3197955',
      v3Fee: '2500',
      v3Pool: '0xEe04B2A82BAb9EfEFCD626F5D66F51Cc2B6FA12A',
      rangePercentBelow: '5',
      rangePercentAbove: '15',
      stableToken: '0x55d398326f99059fF775485246999027B3197955',
      stableBudgetWei: 'max',
      exitBelowPolicy: 'sell_stable',
      exitAbovePolicy: 'restake',
      slippageBps: '100',
      ensureApprovals: true,
      saveV3PositionTokenIdVariable: 'v3PositionTokenId',
    },
    handlesOwnWait: true,
    getSummary: function(action) {
      var below = (action.rangePercentBelow || '').toString().trim() || '?';
      var above = (action.rangePercentAbove || '').toString().trim() || '?';
      return 'V3 enter stable −' + below + '%/+' + above + '%';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        'saveV3PositionTokenIdVariable', 'saveTickLower', 'saveTickUpper',
        'saveMinPrice', 'saveMaxPrice', 'saveToken0', 'saveToken1',
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
