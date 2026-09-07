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
    if (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate) {
      return CFS_templateResolver.resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
    }
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler('bscPancake', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscPancake)');
    var getRowValue = ctx.getRowValue;
    var currentRow = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;
    var row = currentRow;

    var operation = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'operation', row, getRowValue) : trimResolved(row, getRowValue, action, action.operation));
    if (!operation) throw new Error('bscPancake: set operation');

    var msg = {
      type: 'CFS_BSC_POOL_EXECUTE',
      operation: operation,
      to: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'to', row, getRowValue) : trimResolved(row, getRowValue, action, action.to)),
      token: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'token', row, getRowValue) : trimResolved(row, getRowValue, action, action.token)),
      spender: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'spender', row, getRowValue) : trimResolved(row, getRowValue, action, action.spender)),
      amount: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amount', row, getRowValue) : trimResolved(row, getRowValue, action, action.amount)),
      path: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'path', row, getRowValue) : trimResolved(row, getRowValue, action, action.path)),
      amountIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountIn)),
      amountOutMin: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountOutMin', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountOutMin)),
      amountOut: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountOut', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountOut)),
      amountInMax: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountInMax', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountInMax)),
      ethWei: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'ethWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.ethWei)),
      tokenA: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenA', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenA)),
      tokenB: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenB', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenB)),
      tokenIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenIn)),
      tokenOut: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenOut', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenOut)),
      v3Fee: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Fee', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Fee)),
      v3Path: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Path', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Path)),
      tickLower: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tickLower', row, getRowValue) : trimResolved(row, getRowValue, action, action.tickLower)),
      tickUpper: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tickUpper', row, getRowValue) : trimResolved(row, getRowValue, action, action.tickUpper)),
      minPrice: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'minPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.minPrice)),
      maxPrice: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'maxPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.maxPrice)),
      priceDenomination: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'priceDenomination', row, getRowValue) : trimResolved(row, getRowValue, action, action.priceDenomination)),
      v3PositionTokenId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3PositionTokenId', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3PositionTokenId)),
      v3Amount0Desired: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Amount0Desired', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Amount0Desired)),
      v3Amount1Desired: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Amount1Desired', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Amount1Desired)),
      v3Amount0Min: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Amount0Min', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Amount0Min)),
      v3Amount1Min: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Amount1Min', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Amount1Min)),
      v3Liquidity: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Liquidity', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Liquidity)),
      v3Amount0Max: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Amount0Max', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Amount0Max)),
      v3Amount1Max: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Amount1Max', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Amount1Max)),
      sqrtPriceLimitX96: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'sqrtPriceLimitX96', row, getRowValue) : trimResolved(row, getRowValue, action, action.sqrtPriceLimitX96)),
      swapRouterV3Address: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'swapRouterV3Address', row, getRowValue) : trimResolved(row, getRowValue, action, action.swapRouterV3Address)),
      positionManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'positionManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.positionManagerAddress)),
      amountADesired: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountADesired', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountADesired)),
      amountBDesired: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountBDesired', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountBDesired)),
      amountAMin: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountAMin', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountAMin)),
      amountBMin: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountBMin', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountBMin)),
      liquidity: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'liquidity', row, getRowValue) : trimResolved(row, getRowValue, action, action.liquidity)),
      pid: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'pid', row, getRowValue) : trimResolved(row, getRowValue, action, action.pid)),
      routerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'routerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.routerAddress)),
      masterChefAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'masterChefAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.masterChefAddress)),
      deadline: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'deadline', row, getRowValue) : trimResolved(row, getRowValue, action, action.deadline)),
      waitConfirmations: action.waitConfirmations,
      gasLimit: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasLimit', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasLimit)),
      infinityFee: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infinityFee', row, getRowValue) : trimResolved(row, getRowValue, action, action.infinityFee)),
      binStep: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binStep', row, getRowValue) : trimResolved(row, getRowValue, action, action.binStep)),
      infinityHooks: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infinityHooks', row, getRowValue) : trimResolved(row, getRowValue, action, action.infinityHooks)),
      infinityHooksRegistrationJson: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infinityHooksRegistrationJson', row, getRowValue) : trimResolved(row, getRowValue, action, action.infinityHooksRegistrationJson)),
      binPoolManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binPoolManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.binPoolManagerAddress)),
      binPositionManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binPositionManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.binPositionManagerAddress)),
      infiPoolInitialized: action.infiPoolInitialized,
      infiLiquidityShape: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiLiquidityShape', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiLiquidityShape)),
      infiActiveIdDesired: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiActiveIdDesired', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiActiveIdDesired)),
      infiIdSlippage: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiIdSlippage', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiIdSlippage)),
      infiLowerBinId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiLowerBinId', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiLowerBinId)),
      infiUpperBinId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiUpperBinId', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiUpperBinId)),
      infiAmount0: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiAmount0', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiAmount0)),
      infiAmount1: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiAmount1', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiAmount1)),
      infiAmount0Max: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiAmount0Max', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiAmount0Max)),
      infiAmount1Max: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiAmount1Max', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiAmount1Max)),
      infiDeadline: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiDeadline', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiDeadline)),
      infiModifyHookData: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiModifyHookData', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiModifyHookData)),
      infiPayload: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiPayload', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiPayload)),
      infiAmount0Min: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiAmount0Min', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiAmount0Min)),
      infiAmount1Min: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiAmount1Min', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiAmount1Min)),
      infiRemoveBinIds: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiRemoveBinIds', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiRemoveBinIds)),
      infiRemoveShares: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiRemoveShares', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiRemoveShares)),
      infiFarmClaimTs: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiFarmClaimTs', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiFarmClaimTs)),
      infiFarmClaimSkipIfNoRewards: action.infiFarmClaimSkipIfNoRewards,
      distributorAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'distributorAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.distributorAddress)),
      permit2Spender: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'permit2Spender', row, getRowValue) : trimResolved(row, getRowValue, action, action.permit2Spender)),
      permit2Amount: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'permit2Amount', row, getRowValue) : trimResolved(row, getRowValue, action, action.permit2Amount)),
      permit2Expiration: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'permit2Expiration', row, getRowValue) : trimResolved(row, getRowValue, action, action.permit2Expiration)),
      infiSwapAmountIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiSwapAmountIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiSwapAmountIn)),
      infiSwapAmountOutMin: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiSwapAmountOutMin', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiSwapAmountOutMin)),
      infiSwapAmountOut: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiSwapAmountOut', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiSwapAmountOut)),
      infiSwapAmountInMax: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiSwapAmountInMax', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiSwapAmountInMax)),
      infiSwapCurrencyIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiSwapCurrencyIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiSwapCurrencyIn)),
      infiBinPathJson: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiBinPathJson', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiBinPathJson)),
      infiSwapZeroForOne: action.infiSwapZeroForOne,
      gasReloadBelowWei: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasReloadBelowWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasReloadBelowWei)),
      gasReloadTargetWei: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasReloadTargetWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasReloadTargetWei)),
      gasReloadStableToken: trimResolved(row, getRowValue, action, action.gasReloadStableToken || action.stableToken),
      stableReserveWei: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'stableReserveWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.stableReserveWei)),
      gasReloadEnabled: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasReloadEnabled', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasReloadEnabled)),
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC transaction failed');
    }

    if (row && typeof row === 'object') {
      var hVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveTxHashVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveTxHashVariable));
      if (hVar && response.txHash) row[hVar] = response.txHash;
      var eVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveExplorerUrlVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveExplorerUrlVariable));
      if (eVar && response.explorerUrl) row[eVar] = response.explorerUrl;
      var nftVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveV3PositionTokenIdVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveV3PositionTokenIdVariable));
      if (nftVar && response.v3MintedPositionTokenId != null) row[nftVar] = response.v3MintedPositionTokenId;
      var infiNftVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveInfiPositionTokenIdVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveInfiPositionTokenIdVariable));
      if (infiNftVar && response.infiMintedPositionTokenId != null) row[infiNftVar] = response.infiMintedPositionTokenId;
      if (operation === 'infiFarmClaim') {
        var farmOutVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveInfiFarmClaimOutcomeVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveInfiFarmClaimOutcomeVariable));
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
