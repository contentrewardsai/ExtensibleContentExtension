(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscPancake', {
    label: 'BSC PancakeSwap / pool',
    defaultAction: {
      type: 'bscPancake',
      runIf: '',
      operation: 'swapExactTokensForTokens',
      to: '',
      token: '',
      spender: '',
      amount: '',
      path: '',
      amountIn: '',
      amountOutMin: '',
      amountOut: '',
      amountInMax: '',
      ethWei: '',
      tokenA: '',
      tokenB: '',
      tokenIn: '',
      tokenOut: '',
      v3Fee: '',
      v3Path: '',
      tickLower: '',
      tickUpper: '',
      v3PositionTokenId: '',
      v3Amount0Desired: '',
      v3Amount1Desired: '',
      v3Amount0Min: '',
      v3Amount1Min: '',
      v3Liquidity: '',
      v3Amount0Max: '',
      v3Amount1Max: '',
      sqrtPriceLimitX96: '',
      swapRouterV3Address: '',
      positionManagerAddress: '',
      amountADesired: '',
      amountBDesired: '',
      amountAMin: '',
      amountBMin: '',
      liquidity: '',
      pid: '',
      routerAddress: '',
      masterChefAddress: '',
      deadline: '',
      waitConfirmations: 1,
      gasLimit: '',
      saveTxHashVariable: 'bscTxHash',
      saveExplorerUrlVariable: 'bscExplorerUrl',
      saveV3PositionTokenIdVariable: '',
      infinityFee: '',
      binStep: '',
      infinityHooks: '',
      infinityHooksRegistrationJson: '',
      binPoolManagerAddress: '',
      binPositionManagerAddress: '',
      infiPoolInitialized: false,
      infiLiquidityShape: 'Spot',
      infiActiveIdDesired: '',
      infiIdSlippage: '',
      infiLowerBinId: '',
      infiUpperBinId: '',
      infiAmount0: '',
      infiAmount1: '',
      infiAmount0Max: '',
      infiAmount1Max: '',
      infiDeadline: '',
      infiModifyHookData: '',
      infiPayload: '',
      infiAmount0Min: '',
      infiAmount1Min: '',
      infiRemoveBinIds: '',
      infiRemoveShares: '',
      infiFarmClaimTs: '',
      infiFarmClaimSkipIfNoRewards: false,
      distributorAddress: '',
      permit2Spender: '',
      permit2Amount: '',
      permit2Expiration: '',
      infiSwapAmountIn: '',
      infiSwapAmountOutMin: '',
      infiSwapAmountOut: '',
      infiSwapAmountInMax: '',
      infiSwapCurrencyIn: '',
      infiBinPathJson: '',
      infiSwapZeroForOne: false,
      saveInfiPositionTokenIdVariable: '',
      saveInfiFarmClaimOutcomeVariable: '',
    },
    getSummary: function(action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'BSC: ' + op : 'BSC PancakeSwap / pool';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveTxHashVariable || '').trim();
      if (s1) out.push({ rowKey: s1, label: s1, hint: 'tx hash' });
      var s2 = (action.saveExplorerUrlVariable || '').trim();
      if (s2) out.push({ rowKey: s2, label: s2, hint: 'explorer' });
      var s3 = (action.saveV3PositionTokenIdVariable || '').trim();
      if (s3) out.push({ rowKey: s3, label: s3, hint: 'V3 position NFT id' });
      var s4 = (action.saveInfiPositionTokenIdVariable || '').trim();
      if (s4) out.push({ rowKey: s4, label: s4, hint: 'Infinity Bin position NFT id' });
      var s5 = (action.saveInfiFarmClaimOutcomeVariable || '').trim();
      if (s5) out.push({ rowKey: s5, label: s5, hint: 'JSON outcome (infiFarmClaim only)' });
      return out;
    },
  });
})();
