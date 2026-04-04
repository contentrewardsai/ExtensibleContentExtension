/**
 * BSC read-only RPC queries (balances, quotes, farm reads, V2/V3 pool + QuoterV2, tx receipt, blockByTag, totalSupply, rpcInfo, nonce, etc.) — no signing.
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

  window.__CFS_registerStepHandler('bscQuery', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscQuery)');
    var getRowValue = ctx.getRowValue;
    var currentRow = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;
    var row = currentRow;

    var operation = trimResolved(row, getRowValue, action, action.operation);
    if (!operation) throw new Error('bscQuery: set operation');

    var msg = {
      type: 'CFS_BSC_QUERY',
      operation: operation,
      txHash: trimResolved(row, getRowValue, action, action.txHash),
      address: trimResolved(row, getRowValue, action, action.address),
      token: trimResolved(row, getRowValue, action, action.token),
      holder: trimResolved(row, getRowValue, action, action.holder),
      owner: trimResolved(row, getRowValue, action, action.owner),
      spender: trimResolved(row, getRowValue, action, action.spender),
      pair: trimResolved(row, getRowValue, action, action.pair),
      path: trimResolved(row, getRowValue, action, action.path),
      amountIn: trimResolved(row, getRowValue, action, action.amountIn),
      amountOut: trimResolved(row, getRowValue, action, action.amountOut),
      routerAddress: trimResolved(row, getRowValue, action, action.routerAddress),
      factoryAddress: trimResolved(row, getRowValue, action, action.factoryAddress),
      tokenA: trimResolved(row, getRowValue, action, action.tokenA),
      tokenB: trimResolved(row, getRowValue, action, action.tokenB),
      blockTag: trimResolved(row, getRowValue, action, action.blockTag),
      v3Pool: trimResolved(row, getRowValue, action, action.v3Pool),
      factoryV3Address: trimResolved(row, getRowValue, action, action.factoryV3Address),
      v3Fee: trimResolved(row, getRowValue, action, action.v3Fee),
      tokenIn: trimResolved(row, getRowValue, action, action.tokenIn),
      tokenOut: trimResolved(row, getRowValue, action, action.tokenOut),
      quoterV3Address: trimResolved(row, getRowValue, action, action.quoterV3Address),
      sqrtPriceLimitX96: trimResolved(row, getRowValue, action, action.sqrtPriceLimitX96),
      v3Path: trimResolved(row, getRowValue, action, action.v3Path),
      v3PositionTokenId: trimResolved(row, getRowValue, action, action.v3PositionTokenId),
      positionManagerAddress: trimResolved(row, getRowValue, action, action.positionManagerAddress),
      pid: trimResolved(row, getRowValue, action, action.pid),
      masterChefAddress: trimResolved(row, getRowValue, action, action.masterChefAddress),
      poolId: trimResolved(row, getRowValue, action, action.poolId),
      binId: trimResolved(row, getRowValue, action, action.binId),
      binIdLower: trimResolved(row, getRowValue, action, action.binIdLower),
      binIdUpper: trimResolved(row, getRowValue, action, action.binIdUpper),
      binPoolManagerAddress: trimResolved(row, getRowValue, action, action.binPoolManagerAddress),
      binPositionManagerAddress: trimResolved(row, getRowValue, action, action.binPositionManagerAddress),
      infinityFee: trimResolved(row, getRowValue, action, action.infinityFee),
      binStep: trimResolved(row, getRowValue, action, action.binStep),
      infinityHooks: trimResolved(row, getRowValue, action, action.infinityHooks),
      infinityHooksRegistrationJson: trimResolved(row, getRowValue, action, action.infinityHooksRegistrationJson),
      parametersBytes32: trimResolved(row, getRowValue, action, action.parametersBytes32),
      swapForY: action.swapForY,
      infiPositionTokenId: trimResolved(row, getRowValue, action, action.infiPositionTokenId),
      positionSalt: trimResolved(row, getRowValue, action, action.positionSalt),
      campaignManagerAddress: trimResolved(row, getRowValue, action, action.campaignManagerAddress),
      campaignId: trimResolved(row, getRowValue, action, action.campaignId),
      infiQuoteExactAmount: trimResolved(row, getRowValue, action, action.infiQuoteExactAmount),
      infiQuoteCurrencyIn: trimResolved(row, getRowValue, action, action.infiQuoteCurrencyIn),
      infiBinPathJson: trimResolved(row, getRowValue, action, action.infiBinPathJson),
      infiQuoteZeroForOne: action.infiQuoteZeroForOne,
      infiQuoteHookData: trimResolved(row, getRowValue, action, action.infiQuoteHookData),
      binQuoterAddress: trimResolved(row, getRowValue, action, action.binQuoterAddress),
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC query failed');
    }

    if (row && typeof row === 'object') {
      var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
      if (keyVar && response.result) {
        try {
          row[keyVar] = JSON.stringify(response.result);
        } catch (_) {
          row[keyVar] = String(response.result);
        }
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
