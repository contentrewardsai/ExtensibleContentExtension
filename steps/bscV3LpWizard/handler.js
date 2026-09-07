/**
 * Configure PancakeSwap V3 LP row variables for downstream steps (pool, ticks, amounts, policies).
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

  function saveToRow(row, varName, value) {
    var n = String(varName || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  async function bscQuery(sendMessage, payload) {
    var response = await sendMessage(Object.assign({ type: 'CFS_BSC_QUERY' }, payload));
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC query failed: ' + payload.operation);
    }
    return response.result || {};
  }

  window.__CFS_registerStepHandler('bscV3LpWizard', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscV3LpWizard)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var tokenA = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenA', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenA));
    var tokenB = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'tokenB', row, getRowValue) : trimResolved(row, getRowValue, action, action.tokenB));
    var v3Fee = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Fee', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Fee)) || '500';
    var v3Pool = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'v3Pool', row, getRowValue) : trimResolved(row, getRowValue, action, action.v3Pool));
    var rangePercent = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'rangePercent', row, getRowValue) : trimResolved(row, getRowValue, action, action.rangePercent)) || '0.5';
    var rangePercentBelow = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'rangePercentBelow', row, getRowValue) : trimResolved(row, getRowValue, action, action.rangePercentBelow));
    var rangePercentAbove = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'rangePercentAbove', row, getRowValue) : trimResolved(row, getRowValue, action, action.rangePercentAbove));
    var minPrice = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'minPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.minPrice));
    var maxPrice = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'maxPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.maxPrice));
    var bnbBudgetWei = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'bnbBudgetWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.bnbBudgetWei)) || 'max';
    var gasReserveWei = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'gasReserveWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.gasReserveWei));
    var fundMode = (((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'fundMode', row, getRowValue) : trimResolved(row, getRowValue, action, action.fundMode)) || 'bnb').toLowerCase();
    var stableBudgetWei = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'stableBudgetWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.stableBudgetWei)) || 'max';
    var stableReserveWei = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'stableReserveWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.stableReserveWei)) || '0';
    var stableToken = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'stableToken', row, getRowValue) : trimResolved(row, getRowValue, action, action.stableToken))
      || '0x55d398326f99059fF775485246999027B3197955';
    var exitBelowPolicy = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'exitBelowPolicy', row, getRowValue) : trimResolved(row, getRowValue, action, action.exitBelowPolicy)) || 'sell_stable';
    var exitAbovePolicy = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'exitAbovePolicy', row, getRowValue) : trimResolved(row, getRowValue, action, action.exitAbovePolicy)) || 'restake';
    var slippageBps = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'slippageBps', row, getRowValue) : trimResolved(row, getRowValue, action, action.slippageBps)) || '50';
    var previewAmounts = action.previewAmounts !== false;

    if (!tokenA || !tokenB) {
      throw new Error('bscV3LpWizard: set tokenA and tokenB.');
    }

    if (!v3Pool && tokenA && tokenB && v3Fee) {
      var poolRes = await bscQuery(sendMessage, {
        operation: 'v3FactoryGetPool',
        tokenA: tokenA,
        tokenB: tokenB,
        v3Fee: v3Fee,
      });
      if (poolRes.pool && poolRes.hasPool !== false) {
        v3Pool = poolRes.pool;
      } else {
        throw new Error('bscV3LpWizard: V3 pool not found for tokenA/tokenB/v3Fee.');
      }
    }
    if (!v3Pool) throw new Error('bscV3LpWizard: set v3Pool or tokenA+tokenB+v3Fee.');

    var rangeRes;
    if (minPrice && maxPrice) {
      rangeRes = await bscQuery(sendMessage, {
        operation: 'v3PriceTicks',
        v3Pool: v3Pool,
        minPrice: minPrice,
        maxPrice: maxPrice,
        priceDenomination: 'token1PerToken0',
      });
      rangeRes = {
        tickLower: rangeRes.tickLower,
        tickUpper: rangeRes.tickUpper,
        minPrice: rangeRes.minPriceToken1PerToken0 || minPrice,
        maxPrice: rangeRes.maxPriceToken1PerToken0 || maxPrice,
      };
    } else {
      var rangePayload = {
        operation: 'v3RangeFromPercent',
        v3Pool: v3Pool,
        rangePercent: rangePercent,
      };
      if (rangePercentBelow) rangePayload.rangePercentBelow = rangePercentBelow;
      if (rangePercentAbove) rangePayload.rangePercentAbove = rangePercentAbove;
      rangeRes = await bscQuery(sendMessage, rangePayload);
    }

    var tickLower = rangeRes.tickLower != null ? String(rangeRes.tickLower) : '';
    var tickUpper = rangeRes.tickUpper != null ? String(rangeRes.tickUpper) : '';
    minPrice = rangeRes.minPrice != null ? String(rangeRes.minPrice) : minPrice;
    maxPrice = rangeRes.maxPrice != null ? String(rangeRes.maxPrice) : maxPrice;
    if (rangeRes.rangePercentBelow != null) rangePercentBelow = String(rangeRes.rangePercentBelow);
    if (rangeRes.rangePercentAbove != null) rangePercentAbove = String(rangeRes.rangePercentAbove);

    var amount0Desired = '';
    var amount1Desired = '';
    var bnbFor0Wei = '';
    var bnbFor1Wei = '';
    var stableFor0Wei = '';
    var stableFor1Wei = '';
    var token0 = '';
    var token1 = '';
    var resolvedBudgetWei = fundMode === 'stable' ? stableBudgetWei : bnbBudgetWei;

    if (previewAmounts) {
      var amtPayload;
      if (fundMode === 'stable') {
        amtPayload = {
          operation: 'v3LpAmountsFromStable',
          v3Pool: v3Pool,
          stableToken: stableToken,
          stableBudgetWei: stableBudgetWei,
          stableReserveWei: stableReserveWei,
          slippageBps: slippageBps,
        };
      } else {
        amtPayload = {
          operation: 'v3LpAmountsFromBnb',
          v3Pool: v3Pool,
          bnbBudgetWei: bnbBudgetWei,
        };
        if (gasReserveWei) amtPayload.gasReserveWei = gasReserveWei;
      }
      if (minPrice && maxPrice) {
        amtPayload.minPrice = minPrice;
        amtPayload.maxPrice = maxPrice;
      } else {
        amtPayload.rangePercent = rangePercent;
        if (rangePercentBelow) amtPayload.rangePercentBelow = rangePercentBelow;
        if (rangePercentAbove) amtPayload.rangePercentAbove = rangePercentAbove;
      }
      var amtRes = await bscQuery(sendMessage, amtPayload);
      amount0Desired = amtRes.amount0Desired != null ? String(amtRes.amount0Desired) : '';
      amount1Desired = amtRes.amount1Desired != null ? String(amtRes.amount1Desired) : '';
      bnbFor0Wei = amtRes.bnbFor0Wei != null ? String(amtRes.bnbFor0Wei) : '';
      bnbFor1Wei = amtRes.bnbFor1Wei != null ? String(amtRes.bnbFor1Wei) : '';
      stableFor0Wei = amtRes.stableFor0Wei != null ? String(amtRes.stableFor0Wei) : '';
      stableFor1Wei = amtRes.stableFor1Wei != null ? String(amtRes.stableFor1Wei) : '';
      token0 = amtRes.token0 != null ? String(amtRes.token0) : '';
      token1 = amtRes.token1 != null ? String(amtRes.token1) : '';
      if (amtRes.fee != null && String(amtRes.fee).trim()) v3Fee = String(amtRes.fee);
      if (amtRes.bnbBudgetWei != null) resolvedBudgetWei = String(amtRes.bnbBudgetWei);
      if (amtRes.stableBudgetWei != null) resolvedBudgetWei = String(amtRes.stableBudgetWei);
      if (amtRes.rangePercentBelow != null) rangePercentBelow = String(amtRes.rangePercentBelow);
      if (amtRes.rangePercentAbove != null) rangePercentAbove = String(amtRes.rangePercentAbove);
    }

    if (row && typeof row === 'object') {
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveTokenA', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveTokenA)) || 'tokenA', tokenA);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveTokenB', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveTokenB)) || 'tokenB', tokenB);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveV3Fee', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveV3Fee)) || 'v3Fee', v3Fee);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveV3Pool', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveV3Pool)) || 'v3Pool', v3Pool);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveRangePercent', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveRangePercent)) || 'rangePercent', rangePercent);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveRangePercentBelow', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveRangePercentBelow)) || 'rangePercentBelow', rangePercentBelow);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveRangePercentAbove', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveRangePercentAbove)) || 'rangePercentAbove', rangePercentAbove);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveMinPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveMinPrice)) || 'minPrice', minPrice);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveMaxPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveMaxPrice)) || 'maxPrice', maxPrice);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveTickLower', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveTickLower)) || 'tickLower', tickLower);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveTickUpper', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveTickUpper)) || 'tickUpper', tickUpper);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveBnbBudgetWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveBnbBudgetWei)) || 'bnbBudgetWei', fundMode === 'stable' ? '' : resolvedBudgetWei);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveStableBudgetWei', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveStableBudgetWei)) || 'stableBudgetWei', fundMode === 'stable' ? resolvedBudgetWei : stableBudgetWei);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveAmount0Desired', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveAmount0Desired)) || 'amount0Desired', amount0Desired);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveAmount1Desired', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveAmount1Desired)) || 'amount1Desired', amount1Desired);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveBnbFor0Wei', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveBnbFor0Wei)) || 'bnbFor0Wei', bnbFor0Wei);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveBnbFor1Wei', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveBnbFor1Wei)) || 'bnbFor1Wei', bnbFor1Wei);
      saveToRow(row, 'stableFor0Wei', stableFor0Wei);
      saveToRow(row, 'stableFor1Wei', stableFor1Wei);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveToken0', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveToken0)) || 'token0', token0);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveToken1', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveToken1)) || 'token1', token1);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveStableToken', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveStableToken)) || 'stableToken', stableToken);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveExitBelowPolicy', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveExitBelowPolicy)) || 'exitBelowPolicy', exitBelowPolicy);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveExitAbovePolicy', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveExitAbovePolicy)) || 'exitAbovePolicy', exitAbovePolicy);
      saveToRow(row, ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveSlippageBps', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveSlippageBps)) || 'slippageBps', slippageBps);
      saveToRow(row, 'fundMode', fundMode);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
