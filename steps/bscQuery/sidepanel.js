(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscQuery', {
    label: 'BSC read-only query',
    defaultAction: {
      type: 'bscQuery',
      runIf: '',
      operation: 'nativeBalance',
      txHash: '',
      address: '',
      token: '',
      holder: '',
      owner: '',
      spender: '',
      pair: '',
      path: '',
      amountIn: '',
      amountOut: '',
      routerAddress: '',
      factoryAddress: '',
      tokenA: '',
      tokenB: '',
      blockTag: '',
      v3Pool: '',
      factoryV3Address: '',
      v3Fee: '',
      tokenIn: '',
      tokenOut: '',
      quoterV3Address: '',
      sqrtPriceLimitX96: '',
      v3Path: '',
      v3PositionTokenId: '',
      positionManagerAddress: '',
      pid: '',
      masterChefAddress: '',
      poolId: '',
      binId: '',
      binIdLower: '',
      binIdUpper: '',
      binPoolManagerAddress: '',
      binPositionManagerAddress: '',
      infinityFee: '',
      binStep: '',
      infinityHooks: '',
      infinityHooksRegistrationJson: '',
      parametersBytes32: '',
      swapForY: false,
      infiPositionTokenId: '',
      positionSalt: '',
      campaignManagerAddress: '',
      campaignId: '',
      infiQuoteExactAmount: '',
      infiQuoteCurrencyIn: '',
      infiBinPathJson: '',
      infiQuoteZeroForOne: false,
      infiQuoteHookData: '',
      binQuoterAddress: '',
      saveResultVariable: 'bscQueryResult',
    },
    getSummary: function(action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'BSC query: ' + op : 'BSC read-only query';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s = String(action.saveResultVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'JSON result' });
      return out;
    },
  });
})();
