/**
 * Mint Pancake V3 LP from a stablecoin budget: size legs → swap stable→token → mint.
 */
(function() {
  'use strict';

  var SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
  var NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  var MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  var ALLOWANCE_SKIP_THRESHOLD = '1000000000000000000000000000000';

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

  function saveToRow(row, varName, value) {
    var n = String(varName || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  function clampSlippageBps(raw) {
    return Math.min(10000, Math.max(0, parseInt(raw, 10) || 100));
  }

  function minAmountFromDesired(desiredStr, slippageBps) {
    if (!desiredStr) return '0';
    try {
      var d = BigInt(desiredStr);
      var bps = BigInt(clampSlippageBps(slippageBps));
      return String(d - (d * bps / 10000n));
    } catch (_) {
      return '0';
    }
  }

  function allowanceSufficient(allowanceStr) {
    if (!allowanceStr) return false;
    try {
      var a = BigInt(allowanceStr);
      if (a >= BigInt(MAX_UINT256)) return true;
      if (a >= BigInt(ALLOWANCE_SKIP_THRESHOLD)) return true;
    } catch (_) {
      return false;
    }
    return false;
  }

  async function bscQuery(sendMessage, payload) {
    var response = await sendMessage(Object.assign({ type: 'CFS_BSC_QUERY' }, payload));
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC query failed: ' + payload.operation);
    }
    return response.result || {};
  }

  async function bscExecute(sendMessage, payload) {
    var response = await sendMessage(Object.assign({ type: 'CFS_BSC_POOL_EXECUTE' }, payload));
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC execute failed: ' + payload.operation);
    }
    return response;
  }

  async function ensureTokenApprovals(sendMessage, tokens, router, npm, amount, gasLimit) {
    var spenders = [router, npm];
    for (var ti = 0; ti < tokens.length; ti++) {
      var tok = tokens[ti];
      if (!tok) continue;
      for (var si = 0; si < spenders.length; si++) {
        var spender = spenders[si];
        var alw = await bscQuery(sendMessage, { operation: 'allowance', token: tok, spender: spender });
        if (allowanceSufficient(alw.allowance)) continue;
        var execPayload = { operation: 'approve', token: tok, spender: spender, amount: amount };
        if (gasLimit) execPayload.gasLimit = gasLimit;
        await bscExecute(sendMessage, execPayload);
      }
    }
  }

  async function ensureFromStableExactOut(sendMessage, swapInfo, v3Fee, gasLimit) {
    if (!swapInfo || !swapInfo.needed) return;
    var amountOut = String(swapInfo.amountOut || '0');
    if (!amountOut || amountOut === '0') return;
    var bal = await bscQuery(sendMessage, { operation: 'erc20Balance', token: swapInfo.tokenOut });
    var have = bal.balance != null ? BigInt(String(bal.balance)) : 0n;
    var need = BigInt(amountOut);
    if (have >= need) return;
    var deficit = need - have;
    var inMax = 'max';
    try {
      var fullOut = BigInt(String(swapInfo.amountOut || '0'));
      var fullInMax = BigInt(String(swapInfo.amountInMax || '0'));
      if (fullOut > 0n && fullInMax > 0n) {
        inMax = String((fullInMax * deficit + fullOut - 1n) / fullOut);
      }
    } catch (_) {
      inMax = 'max';
    }
    var payload = {
      operation: 'v3SwapExactOutputSingle',
      tokenIn: swapInfo.tokenIn,
      tokenOut: swapInfo.tokenOut,
      v3Fee: v3Fee,
      amountOut: deficit.toString(),
      amountInMax: inMax,
    };
    if (gasLimit) payload.gasLimit = gasLimit;
    await bscExecute(sendMessage, payload);
  }

  window.__CFS_registerStepHandler('bscV3EnterFromStable', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscV3EnterFromStable)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var tokenA = trimResolved(row, getRowValue, action, action.tokenA);
    var tokenB = trimResolved(row, getRowValue, action, action.tokenB);
    var v3Fee = trimResolved(row, getRowValue, action, action.v3Fee) || '2500';
    var v3Pool = trimResolved(row, getRowValue, action, action.v3Pool);
    var rangePercent = trimResolved(row, getRowValue, action, action.rangePercent);
    var rangePercentBelow = trimResolved(row, getRowValue, action, action.rangePercentBelow);
    var rangePercentAbove = trimResolved(row, getRowValue, action, action.rangePercentAbove);
    var minPrice = trimResolved(row, getRowValue, action, action.minPrice);
    var maxPrice = trimResolved(row, getRowValue, action, action.maxPrice);
    var stableToken = trimResolved(row, getRowValue, action, action.stableToken)
      || '0x55d398326f99059fF775485246999027B3197955';
    var stableBudgetWei = trimResolved(row, getRowValue, action, action.stableBudgetWei) || 'max';
    var stableReserveWei = trimResolved(row, getRowValue, action, action.stableReserveWei) || '0';
    var exitBelowPolicy = trimResolved(row, getRowValue, action, action.exitBelowPolicy) || 'sell_stable';
    var exitAbovePolicy = trimResolved(row, getRowValue, action, action.exitAbovePolicy) || 'restake';
    var slippageBps = trimResolved(row, getRowValue, action, action.slippageBps) || '100';
    var gasLimit = trimResolved(row, getRowValue, action, action.gasLimit);
    var ensureApprovals = action.ensureApprovals !== false;
    var router = trimResolved(row, getRowValue, action, action.swapRouterV3Address) || SWAP_ROUTER_V3;
    var npm = trimResolved(row, getRowValue, action, action.positionManagerAddress) || NPM_V3;

    if (!v3Pool) {
      if (!tokenA || !tokenB) throw new Error('bscV3EnterFromStable: set v3Pool or tokenA+tokenB+v3Fee.');
      var poolRes = await bscQuery(sendMessage, {
        operation: 'v3FactoryGetPool',
        tokenA: tokenA,
        tokenB: tokenB,
        v3Fee: v3Fee,
      });
      if (!poolRes.pool || poolRes.hasPool === false) {
        throw new Error('bscV3EnterFromStable: V3 pool not found for tokenA/tokenB/v3Fee.');
      }
      v3Pool = poolRes.pool;
    }

    var amtPayload = {
      operation: 'v3LpAmountsFromStable',
      v3Pool: v3Pool,
      stableToken: stableToken,
      stableBudgetWei: stableBudgetWei,
      stableReserveWei: stableReserveWei,
      slippageBps: slippageBps,
    };
    if (minPrice && maxPrice) {
      amtPayload.minPrice = minPrice;
      amtPayload.maxPrice = maxPrice;
    } else {
      if (rangePercent) amtPayload.rangePercent = rangePercent;
      if (rangePercentBelow) amtPayload.rangePercentBelow = rangePercentBelow;
      if (rangePercentAbove) amtPayload.rangePercentAbove = rangePercentAbove;
      if (!rangePercent && !rangePercentBelow && !rangePercentAbove) {
        amtPayload.rangePercentBelow = '5';
        amtPayload.rangePercentAbove = '15';
      }
    }

    var amounts = await bscQuery(sendMessage, amtPayload);
    var token0 = String(amounts.token0 || '');
    var token1 = String(amounts.token1 || '');
    v3Fee = String(amounts.fee || v3Fee);
    minPrice = String(amounts.minPrice || minPrice || '');
    maxPrice = String(amounts.maxPrice || maxPrice || '');
    var tickLower = amounts.tickLower != null ? String(amounts.tickLower) : '';
    var tickUpper = amounts.tickUpper != null ? String(amounts.tickUpper) : '';
    rangePercentBelow = String(amounts.rangePercentBelow || rangePercentBelow || '');
    rangePercentAbove = String(amounts.rangePercentAbove || rangePercentAbove || '');
    var amount0Desired = String(amounts.amount0Desired || '0');
    var amount1Desired = String(amounts.amount1Desired || '0');

    var execBase = {};
    if (gasLimit) execBase.gasLimit = gasLimit;
    if (npm) execBase.positionManagerAddress = npm;
    if (router) execBase.swapRouterV3Address = router;

    // Optional BNB top-up from stable when thresholds are set on the row/action.
    try {
      await bscExecute(sendMessage, Object.assign({}, execBase, {
        operation: 'ensureNativeGasFromStable',
        gasReloadBelowWei: trimResolved(row, getRowValue, action, action.gasReloadBelowWei),
        gasReloadTargetWei: trimResolved(row, getRowValue, action, action.gasReloadTargetWei),
        gasReloadStableToken: stableToken,
        stableReserveWei: stableReserveWei || '0',
      }));
    } catch (_) { /* thresholds unset → helper skips; ignore hard failures */ }

    if (ensureApprovals) {
      await ensureTokenApprovals(sendMessage, [stableToken, token0, token1], router, npm, 'max', gasLimit);
    }

    await ensureFromStableExactOut(sendMessage, amounts.swapStableTo0, v3Fee, gasLimit);
    await ensureFromStableExactOut(sendMessage, amounts.swapStableTo1, v3Fee, gasLimit);

    // Cap mint to balances after prep swaps (dust / quote drift).
    var bal0 = await bscQuery(sendMessage, { operation: 'erc20Balance', token: token0 });
    var bal1 = await bscQuery(sendMessage, { operation: 'erc20Balance', token: token1 });
    var have0 = bal0.balance != null ? BigInt(String(bal0.balance)) : 0n;
    var have1 = bal1.balance != null ? BigInt(String(bal1.balance)) : 0n;
    var want0 = BigInt(amount0Desired);
    var want1 = BigInt(amount1Desired);
    if (have0 < want0) amount0Desired = have0.toString();
    if (have1 < want1) amount1Desired = have1.toString();
    if (BigInt(amount0Desired) <= 0n && BigInt(amount1Desired) <= 0n) {
      throw new Error('bscV3EnterFromStable: no token balances available to mint after stable prep.');
    }

    var mintRes = await bscExecute(sendMessage, Object.assign({}, execBase, {
      operation: 'v3PositionMint',
      tokenA: token0,
      tokenB: token1,
      v3Fee: v3Fee,
      minPrice: minPrice,
      maxPrice: maxPrice,
      amountADesired: amount0Desired,
      amountBDesired: amount1Desired,
      amountAMin: minAmountFromDesired(amount0Desired, slippageBps),
      amountBMin: minAmountFromDesired(amount1Desired, slippageBps),
    }));

    if (row && typeof row === 'object') {
      var nftVar = trimResolved(row, getRowValue, action, action.saveV3PositionTokenIdVariable) || 'v3PositionTokenId';
      if (mintRes.v3MintedPositionTokenId != null) saveToRow(row, nftVar, mintRes.v3MintedPositionTokenId);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveTickLower) || 'tickLower', tickLower);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveTickUpper) || 'tickUpper', tickUpper);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveMinPrice) || 'minPrice', minPrice);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveMaxPrice) || 'maxPrice', maxPrice);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveToken0) || 'token0', token0);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveToken1) || 'token1', token1);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveV3Fee) || 'v3Fee', v3Fee);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveV3Pool) || 'v3Pool', v3Pool);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveRangePercentBelow) || 'rangePercentBelow', rangePercentBelow);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveRangePercentAbove) || 'rangePercentAbove', rangePercentAbove);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveStableToken) || 'stableToken', stableToken);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveExitBelowPolicy) || 'exitBelowPolicy', exitBelowPolicy);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveExitAbovePolicy) || 'exitAbovePolicy', exitAbovePolicy);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveAmount0Desired) || 'amount0Desired', amount0Desired);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveAmount1Desired) || 'amount1Desired', amount1Desired);
      if (tokenA) saveToRow(row, 'tokenA', tokenA);
      if (tokenB) saveToRow(row, 'tokenB', tokenB);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
