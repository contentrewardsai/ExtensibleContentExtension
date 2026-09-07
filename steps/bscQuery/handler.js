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
    if (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate) {
      return CFS_templateResolver.resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
    }
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler('bscQuery', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscQuery)');
    var getRowValue = ctx.getRowValue;
    var currentRow = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;
    var row = currentRow;

    var operation = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'operation', row, getRowValue) : trimResolved(row, getRowValue, action, action.operation));
    if (!operation) throw new Error('bscQuery: set operation');

    var msg = {
      type: 'CFS_BSC_QUERY',
      operation: operation,
      txHash: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'txHash', row, getRowValue) : trimResolved(row, getRowValue, action, action.txHash)),
      address: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'address', row, getRowValue) : trimResolved(row, getRowValue, action, action.address)),
      token: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'token', row, getRowValue) : trimResolved(row, getRowValue, action, action.token)),
      holder: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'holder', row, getRowValue) : trimResolved(row, getRowValue, action, action.holder)),
      owner: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'owner', row, getRowValue) : trimResolved(row, getRowValue, action, action.owner)),
      spender: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'spender', row, getRowValue) : trimResolved(row, getRowValue, action, action.spender)),
      pair: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'pair', row, getRowValue) : trimResolved(row, getRowValue, action, action.pair)),
      path: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'path', row, getRowValue) : trimResolved(row, getRowValue, action, action.path)),
      amountIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountIn)),
      amountOut: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'amountOut', row, getRowValue) : trimResolved(row, getRowValue, action, action.amountOut)),
      routerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'routerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.routerAddress)),
      factoryAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'factoryAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.factoryAddress)),
      tokenA: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenA', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenA)),
      tokenB: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenB', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenB)),
      blockTag: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'blockTag', row, getRowValue) : trimResolved(row, getRowValue, action, action.blockTag)),
      v3Pool: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Pool', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Pool)),
      factoryV3Address: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'factoryV3Address', row, getRowValue) : trimResolved(row, getRowValue, action, action.factoryV3Address)),
      v3Fee: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Fee', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Fee)),
      tokenIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenIn)),
      tokenOut: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenOut', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenOut)),
      quoterV3Address: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'quoterV3Address', row, getRowValue) : trimResolved(row, getRowValue, action, action.quoterV3Address)),
      sqrtPriceLimitX96: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'sqrtPriceLimitX96', row, getRowValue) : trimResolved(row, getRowValue, action, action.sqrtPriceLimitX96)),
      v3Path: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Path', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Path)),
      v3PositionTokenId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3PositionTokenId', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3PositionTokenId)),
      positionManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'positionManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.positionManagerAddress)),
      minPrice: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'minPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.minPrice)),
      maxPrice: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'maxPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.maxPrice)),
      price: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'price', row, getRowValue) : trimResolved(row, getRowValue, action, action.price)),
      priceDenomination: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'priceDenomination', row, getRowValue) : trimResolved(row, getRowValue, action, action.priceDenomination)),
      tick: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tick', row, getRowValue) : trimResolved(row, getRowValue, action, action.tick)),
      tickLower: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tickLower', row, getRowValue) : trimResolved(row, getRowValue, action, action.tickLower)),
      tickUpper: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tickUpper', row, getRowValue) : trimResolved(row, getRowValue, action, action.tickUpper)),
      decimals0: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'decimals0', row, getRowValue) : trimResolved(row, getRowValue, action, action.decimals0)),
      decimals1: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'decimals1', row, getRowValue) : trimResolved(row, getRowValue, action, action.decimals1)),
      tickSpacing: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tickSpacing', row, getRowValue) : trimResolved(row, getRowValue, action, action.tickSpacing)),
      wordRange: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'wordRange', row, getRowValue) : trimResolved(row, getRowValue, action, action.wordRange)),
      maxTicks: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'maxTicks', row, getRowValue) : trimResolved(row, getRowValue, action, action.maxTicks)),
      rangePercent: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'rangePercent', row, getRowValue) : trimResolved(row, getRowValue, action, action.rangePercent)),
      bnbBudget: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'bnbBudget', row, getRowValue) : trimResolved(row, getRowValue, action, action.bnbBudget)),
      bnbBudgetWei: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'bnbBudgetWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.bnbBudgetWei)),
      gasReserveWei: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasReserveWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasReserveWei)),
      driftDirection: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'driftDirection', row, getRowValue) : trimResolved(row, getRowValue, action, action.driftDirection)),
      from: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'from', row, getRowValue) : trimResolved(row, getRowValue, action, action.from)),
      pid: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'pid', row, getRowValue) : trimResolved(row, getRowValue, action, action.pid)),
      masterChefAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'masterChefAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.masterChefAddress)),
      poolId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'poolId', row, getRowValue) : trimResolved(row, getRowValue, action, action.poolId)),
      binId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binId', row, getRowValue) : trimResolved(row, getRowValue, action, action.binId)),
      binIdLower: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binIdLower', row, getRowValue) : trimResolved(row, getRowValue, action, action.binIdLower)),
      binIdUpper: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binIdUpper', row, getRowValue) : trimResolved(row, getRowValue, action, action.binIdUpper)),
      binPoolManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binPoolManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.binPoolManagerAddress)),
      binPositionManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binPositionManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.binPositionManagerAddress)),
      infinityFee: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infinityFee', row, getRowValue) : trimResolved(row, getRowValue, action, action.infinityFee)),
      binStep: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binStep', row, getRowValue) : trimResolved(row, getRowValue, action, action.binStep)),
      infinityHooks: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infinityHooks', row, getRowValue) : trimResolved(row, getRowValue, action, action.infinityHooks)),
      infinityHooksRegistrationJson: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infinityHooksRegistrationJson', row, getRowValue) : trimResolved(row, getRowValue, action, action.infinityHooksRegistrationJson)),
      parametersBytes32: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'parametersBytes32', row, getRowValue) : trimResolved(row, getRowValue, action, action.parametersBytes32)),
      swapForY: action.swapForY,
      infiPositionTokenId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiPositionTokenId', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiPositionTokenId)),
      positionSalt: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'positionSalt', row, getRowValue) : trimResolved(row, getRowValue, action, action.positionSalt)),
      campaignManagerAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'campaignManagerAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.campaignManagerAddress)),
      campaignId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'campaignId', row, getRowValue) : trimResolved(row, getRowValue, action, action.campaignId)),
      infiQuoteExactAmount: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiQuoteExactAmount', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiQuoteExactAmount)),
      infiQuoteCurrencyIn: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiQuoteCurrencyIn', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiQuoteCurrencyIn)),
      infiBinPathJson: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiBinPathJson', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiBinPathJson)),
      infiQuoteZeroForOne: action.infiQuoteZeroForOne,
      infiQuoteHookData: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'infiQuoteHookData', row, getRowValue) : trimResolved(row, getRowValue, action, action.infiQuoteHookData)),
      binQuoterAddress: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'binQuoterAddress', row, getRowValue) : trimResolved(row, getRowValue, action, action.binQuoterAddress)),
    };

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC query failed');
    }

    if (row && typeof row === 'object') {
      var keyVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveResultVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveResultVariable));
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
