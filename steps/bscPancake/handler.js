/**
 * BSC automation via hot wallet: native/ERC20 transfer, WBNB wrap/unwrap, PancakeSwap V2 router, MasterChef (Settings → BSC).
 */
(function() {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler('bscPancake', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscPancake)');
    var getRowValue = ctx.getRowValue;
    var currentRow = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;
    var row = currentRow;

    var operation = trimResolved(row, getRowValue, action, action.operation);
    if (!operation) throw new Error('bscPancake: set operation');

    var msg = {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: operation,
      to: trimResolved(row, getRowValue, action, action.to),
      token: trimResolved(row, getRowValue, action, action.token),
      spender: trimResolved(row, getRowValue, action, action.spender),
      amount: trimResolved(row, getRowValue, action, action.amount),
      path: trimResolved(row, getRowValue, action, action.path),
      amountIn: trimResolved(row, getRowValue, action, action.amountIn),
      amountOutMin: trimResolved(row, getRowValue, action, action.amountOutMin),
      amountOut: trimResolved(row, getRowValue, action, action.amountOut),
      amountInMax: trimResolved(row, getRowValue, action, action.amountInMax),
      ethWei: trimResolved(row, getRowValue, action, action.ethWei),
      tokenA: trimResolved(row, getRowValue, action, action.tokenA),
      tokenB: trimResolved(row, getRowValue, action, action.tokenB),
      tokenIn: trimResolved(row, getRowValue, action, action.tokenIn),
      tokenOut: trimResolved(row, getRowValue, action, action.tokenOut),
      v3Fee: trimResolved(row, getRowValue, action, action.v3Fee),
      v3Path: trimResolved(row, getRowValue, action, action.v3Path),
      tickLower: trimResolved(row, getRowValue, action, action.tickLower),
      tickUpper: trimResolved(row, getRowValue, action, action.tickUpper),
      v3PositionTokenId: trimResolved(row, getRowValue, action, action.v3PositionTokenId),
      v3Amount0Desired: trimResolved(row, getRowValue, action, action.v3Amount0Desired),
      v3Amount1Desired: trimResolved(row, getRowValue, action, action.v3Amount1Desired),
      v3Amount0Min: trimResolved(row, getRowValue, action, action.v3Amount0Min),
      v3Amount1Min: trimResolved(row, getRowValue, action, action.v3Amount1Min),
      v3Liquidity: trimResolved(row, getRowValue, action, action.v3Liquidity),
      v3Amount0Max: trimResolved(row, getRowValue, action, action.v3Amount0Max),
      v3Amount1Max: trimResolved(row, getRowValue, action, action.v3Amount1Max),
      sqrtPriceLimitX96: trimResolved(row, getRowValue, action, action.sqrtPriceLimitX96),
      swapRouterV3Address: trimResolved(row, getRowValue, action, action.swapRouterV3Address),
      positionManagerAddress: trimResolved(row, getRowValue, action, action.positionManagerAddress),
      amountADesired: trimResolved(row, getRowValue, action, action.amountADesired),
      amountBDesired: trimResolved(row, getRowValue, action, action.amountBDesired),
      amountAMin: trimResolved(row, getRowValue, action, action.amountAMin),
      amountBMin: trimResolved(row, getRowValue, action, action.amountBMin),
      liquidity: trimResolved(row, getRowValue, action, action.liquidity),
      pid: trimResolved(row, getRowValue, action, action.pid),
      routerAddress: trimResolved(row, getRowValue, action, action.routerAddress),
      masterChefAddress: trimResolved(row, getRowValue, action, action.masterChefAddress),
      deadline: trimResolved(row, getRowValue, action, action.deadline),
      waitConfirmations: action.waitConfirmations,
      gasLimit: trimResolved(row, getRowValue, action, action.gasLimit),
      infinityFee: trimResolved(row, getRowValue, action, action.infinityFee),
      binStep: trimResolved(row, getRowValue, action, action.binStep),
      infinityHooks: trimResolved(row, getRowValue, action, action.infinityHooks),
      infinityHooksRegistrationJson: trimResolved(row, getRowValue, action, action.infinityHooksRegistrationJson),
      binPoolManagerAddress: trimResolved(row, getRowValue, action, action.binPoolManagerAddress),
      binPositionManagerAddress: trimResolved(row, getRowValue, action, action.binPositionManagerAddress),
      infiPoolInitialized: action.infiPoolInitialized,
      infiLiquidityShape: trimResolved(row, getRowValue, action, action.infiLiquidityShape),
      infiActiveIdDesired: trimResolved(row, getRowValue, action, action.infiActiveIdDesired),
      infiIdSlippage: trimResolved(row, getRowValue, action, action.infiIdSlippage),
      infiLowerBinId: trimResolved(row, getRowValue, action, action.infiLowerBinId),
      infiUpperBinId: trimResolved(row, getRowValue, action, action.infiUpperBinId),
      infiAmount0: trimResolved(row, getRowValue, action, action.infiAmount0),
      infiAmount1: trimResolved(row, getRowValue, action, action.infiAmount1),
      infiAmount0Max: trimResolved(row, getRowValue, action, action.infiAmount0Max),
      infiAmount1Max: trimResolved(row, getRowValue, action, action.infiAmount1Max),
      infiDeadline: trimResolved(row, getRowValue, action, action.infiDeadline),
      infiModifyHookData: trimResolved(row, getRowValue, action, action.infiModifyHookData),
      infiPayload: trimResolved(row, getRowValue, action, action.infiPayload),
      infiAmount0Min: trimResolved(row, getRowValue, action, action.infiAmount0Min),
      infiAmount1Min: trimResolved(row, getRowValue, action, action.infiAmount1Min),
      infiRemoveBinIds: trimResolved(row, getRowValue, action, action.infiRemoveBinIds),
      infiRemoveShares: trimResolved(row, getRowValue, action, action.infiRemoveShares),
      infiFarmClaimTs: trimResolved(row, getRowValue, action, action.infiFarmClaimTs),
      infiFarmClaimSkipIfNoRewards: action.infiFarmClaimSkipIfNoRewards,
      distributorAddress: trimResolved(row, getRowValue, action, action.distributorAddress),
      permit2Spender: trimResolved(row, getRowValue, action, action.permit2Spender),
      permit2Amount: trimResolved(row, getRowValue, action, action.permit2Amount),
      permit2Expiration: trimResolved(row, getRowValue, action, action.permit2Expiration),
      infiSwapAmountIn: trimResolved(row, getRowValue, action, action.infiSwapAmountIn),
      infiSwapAmountOutMin: trimResolved(row, getRowValue, action, action.infiSwapAmountOutMin),
      infiSwapAmountOut: trimResolved(row, getRowValue, action, action.infiSwapAmountOut),
      infiSwapAmountInMax: trimResolved(row, getRowValue, action, action.infiSwapAmountInMax),
      infiSwapCurrencyIn: trimResolved(row, getRowValue, action, action.infiSwapCurrencyIn),
      infiBinPathJson: trimResolved(row, getRowValue, action, action.infiBinPathJson),
      infiSwapZeroForOne: action.infiSwapZeroForOne,
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC transaction failed');
    }

    if (row && typeof row === 'object') {
      var hVar = trimResolved(row, getRowValue, action, action.saveTxHashVariable);
      if (hVar && response.txHash) row[hVar] = response.txHash;
      var eVar = trimResolved(row, getRowValue, action, action.saveExplorerUrlVariable);
      if (eVar && response.explorerUrl) row[eVar] = response.explorerUrl;
      var nftVar = trimResolved(row, getRowValue, action, action.saveV3PositionTokenIdVariable);
      if (nftVar && response.v3MintedPositionTokenId != null) row[nftVar] = response.v3MintedPositionTokenId;
      var infiNftVar = trimResolved(row, getRowValue, action, action.saveInfiPositionTokenIdVariable);
      if (infiNftVar && response.infiMintedPositionTokenId != null) row[infiNftVar] = response.infiMintedPositionTokenId;
      if (operation === 'infiFarmClaim') {
        var farmOutVar = trimResolved(row, getRowValue, action, action.saveInfiFarmClaimOutcomeVariable);
        if (farmOutVar) {
          try {
            if (response.skipped) {
              row[farmOutVar] = JSON.stringify({
                skipped: true,
                skipReason: response.skipReason != null ? String(response.skipReason) : '',
              });
            } else {
              row[farmOutVar] = JSON.stringify({
                skipped: false,
                txHash: response.txHash != null ? String(response.txHash) : '',
                explorerUrl: response.explorerUrl != null ? String(response.explorerUrl) : '',
              });
            }
          } catch (_) {
            row[farmOutVar] = response.skipped ? '{"skipped":true}' : '{"skipped":false}';
          }
        }
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
