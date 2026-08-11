/**
 * Single-step V3 rebalance: decrease → collect → (burn) → restake range → fund → approve → mint.
 */
(function() {
  'use strict';

  var SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
  var NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  var WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
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
    return Math.min(10000, Math.max(0, parseInt(raw, 10) || 50));
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

  async function ensureTokenBalance(sendMessage, token, desiredStr, gasLimit) {
    if (!desiredStr || desiredStr === '0') return;
    var bal = await bscQuery(sendMessage, { operation: 'erc20Balance', token: token });
    var have = bal.balance != null ? BigInt(String(bal.balance)) : 0n;
    var need = BigInt(desiredStr);
    if (have >= need) return;
    var deficit = need - have;
    if (token.toLowerCase() === WBNB.toLowerCase()) return;
    var swapPayload = {
      operation: 'swapETHForExactTokens',
      path: WBNB + ',' + token,
      amountOut: deficit.toString(),
      ethWei: 'max',
    };
    if (gasLimit) swapPayload.gasLimit = gasLimit;
    await bscExecute(sendMessage, swapPayload);
  }

  window.__CFS_registerStepHandler('bscV3RebalanceOnce', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscV3RebalanceOnce)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var v3PositionTokenId = trimResolved(row, getRowValue, action, action.v3PositionTokenId);
    var v3Pool = trimResolved(row, getRowValue, action, action.v3Pool);
    var rangePercent = trimResolved(row, getRowValue, action, action.rangePercent) || '1';
    var rangePercentBelow = trimResolved(row, getRowValue, action, action.rangePercentBelow);
    var rangePercentAbove = trimResolved(row, getRowValue, action, action.rangePercentAbove);
    var driftDirection = trimResolved(row, getRowValue, action, action.driftDirection) || 'above';
    var slippageBps = trimResolved(row, getRowValue, action, action.slippageBps) || '50';
    var gasLimit = trimResolved(row, getRowValue, action, action.gasLimit);
    var burnPosition = action.burnPosition !== false;
    var ensureApprovals = action.ensureApprovals !== false;
    var router = trimResolved(row, getRowValue, action, action.swapRouterV3Address) || SWAP_ROUTER_V3;
    var npm = trimResolved(row, getRowValue, action, action.positionManagerAddress) || NPM_V3;

    if (!v3PositionTokenId) throw new Error('bscV3RebalanceOnce: set v3PositionTokenId.');
    if (!v3Pool) throw new Error('bscV3RebalanceOnce: set v3Pool.');

    var fundMode = (trimResolved(row, getRowValue, action, action.fundMode) || 'bnb').toLowerCase();
    var stableToken = trimResolved(row, getRowValue, action, action.stableToken)
      || '0x55d398326f99059fF775485246999027B3197955';
    var oldTokenId = v3PositionTokenId;

    var execBase = {};
    if (gasLimit) execBase.gasLimit = gasLimit;
    if (npm) execBase.positionManagerAddress = npm;

    // Optional gas top-up from stable before signing
    try {
      await bscExecute(sendMessage, Object.assign({}, execBase, {
        operation: 'ensureNativeGasFromStable',
        gasReloadBelowWei: trimResolved(row, getRowValue, action, action.gasReloadBelowWei),
        gasReloadTargetWei: trimResolved(row, getRowValue, action, action.gasReloadTargetWei),
        gasReloadStableToken: stableToken,
        stableReserveWei: trimResolved(row, getRowValue, action, action.stableReserveWei) || '0',
      }));
    } catch (_) { /* thresholds unset → no-op inside helper when skipped via missing fields may throw — ignore */ }

    await bscExecute(sendMessage, Object.assign({}, execBase, {
      operation: 'v3PositionDecreaseLiquidity',
      v3PositionTokenId: v3PositionTokenId,
      v3Liquidity: 'max',
      v3Amount0Min: '0',
      v3Amount1Min: '0',
    }));

    await bscExecute(sendMessage, Object.assign({}, execBase, {
      operation: 'v3PositionCollect',
      v3PositionTokenId: v3PositionTokenId,
    }));

    if (burnPosition) {
      await bscExecute(sendMessage, Object.assign({}, execBase, {
        operation: 'v3PositionBurn',
        v3PositionTokenId: v3PositionTokenId,
      }));
    }

    var restakePayload = {
      operation: 'v3RestakeRange',
      v3Pool: v3Pool,
      rangePercent: rangePercent,
      driftDirection: driftDirection,
    };
    if (rangePercentBelow) restakePayload.rangePercentBelow = rangePercentBelow;
    if (rangePercentAbove) restakePayload.rangePercentAbove = rangePercentAbove;
    var restake = await bscQuery(sendMessage, restakePayload);

    var minPrice = String(restake.minPrice || '');
    var maxPrice = String(restake.maxPrice || '');
    var tickLower = restake.tickLower != null ? String(restake.tickLower) : '';
    var tickUpper = restake.tickUpper != null ? String(restake.tickUpper) : '';

    var token0 = '';
    var token1 = '';
    var v3Fee = trimResolved(row, getRowValue, action, action.v3Fee) || '500';
    var amount0Desired = '0';
    var amount1Desired = '0';

    if (fundMode === 'stable') {
      var amtStable = {
        operation: 'v3LpAmountsFromStable',
        v3Pool: v3Pool,
        minPrice: minPrice,
        maxPrice: maxPrice,
        stableToken: stableToken,
        stableBudgetWei: trimResolved(row, getRowValue, action, action.stableBudgetWei) || 'max',
        stableReserveWei: trimResolved(row, getRowValue, action, action.stableReserveWei) || '0',
        slippageBps: slippageBps,
      };
      var amountsS = await bscQuery(sendMessage, amtStable);
      token0 = String(amountsS.token0 || '');
      token1 = String(amountsS.token1 || '');
      v3Fee = String(amountsS.fee || v3Fee);
      amount0Desired = String(amountsS.amount0Desired || '0');
      amount1Desired = String(amountsS.amount1Desired || '0');
      if (ensureApprovals) {
        await ensureTokenApprovals(sendMessage, [stableToken, token0, token1], router, npm, 'max', gasLimit);
      }
      async function ensureFromStable(swapInfo) {
        if (!swapInfo || !swapInfo.needed) return;
        var out = String(swapInfo.amountOut || '0');
        if (!out || out === '0') return;
        var bal = await bscQuery(sendMessage, { operation: 'erc20Balance', token: swapInfo.tokenOut });
        var have = bal.balance != null ? BigInt(String(bal.balance)) : 0n;
        var need = BigInt(out);
        if (have >= need) return;
        var deficit = need - have;
        var inMax = String(swapInfo.amountInMax || 'max');
        await bscExecute(sendMessage, Object.assign({}, execBase, {
          operation: 'v3SwapExactOutputSingle',
          tokenIn: swapInfo.tokenIn,
          tokenOut: swapInfo.tokenOut,
          v3Fee: v3Fee,
          amountOut: deficit.toString(),
          amountInMax: inMax,
          swapRouterV3Address: router,
        }));
      }
      await ensureFromStable(amountsS.swapStableTo0);
      await ensureFromStable(amountsS.swapStableTo1);
      var bal0s = await bscQuery(sendMessage, { operation: 'erc20Balance', token: token0 });
      var bal1s = await bscQuery(sendMessage, { operation: 'erc20Balance', token: token1 });
      if (bal0s.balance != null && BigInt(String(bal0s.balance)) < BigInt(amount0Desired)) {
        amount0Desired = String(bal0s.balance);
      }
      if (bal1s.balance != null && BigInt(String(bal1s.balance)) < BigInt(amount1Desired)) {
        amount1Desired = String(bal1s.balance);
      }
    } else {
      var amtPayload = {
        operation: 'v3LpAmountsFromBnb',
        v3Pool: v3Pool,
        minPrice: minPrice,
        maxPrice: maxPrice,
        bnbBudgetWei: trimResolved(row, getRowValue, action, action.bnbBudgetWei) || 'max',
      };
      var gasReserve = trimResolved(row, getRowValue, action, action.gasReserveWei);
      if (gasReserve) amtPayload.gasReserveWei = gasReserve;
      var amounts = await bscQuery(sendMessage, amtPayload);
      token0 = String(amounts.token0 || '');
      token1 = String(amounts.token1 || '');
      v3Fee = String(amounts.fee || v3Fee);
      amount0Desired = String(amounts.amount0Desired || '0');
      amount1Desired = String(amounts.amount1Desired || '0');
      await ensureTokenBalance(sendMessage, token0, amount0Desired, gasLimit);
      await ensureTokenBalance(sendMessage, token1, amount1Desired, gasLimit);
      if (ensureApprovals) {
        await ensureTokenApprovals(sendMessage, [token0, token1], router, npm, 'max', gasLimit);
      }
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
      swapRouterV3Address: router,
    }));

    if (row && typeof row === 'object') {
      var nftVar = trimResolved(row, getRowValue, action, action.saveV3PositionTokenIdVariable) || 'v3PositionTokenId';
      if (mintRes.v3MintedPositionTokenId != null) saveToRow(row, nftVar, mintRes.v3MintedPositionTokenId);
      saveToRow(row, 'oldTokenId', oldTokenId);
      saveToRow(row, 'fundMode', fundMode);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveTickLower) || 'tickLower', tickLower);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveTickUpper) || 'tickUpper', tickUpper);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveMinPrice) || 'minPrice', minPrice);
      saveToRow(row, trimResolved(row, getRowValue, action, action.saveMaxPrice) || 'maxPrice', maxPrice);
      if (rangePercentBelow) saveToRow(row, 'rangePercentBelow', rangePercentBelow);
      if (rangePercentAbove) saveToRow(row, 'rangePercentAbove', rangePercentAbove);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
