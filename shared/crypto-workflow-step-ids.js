/**
 * Step `type` values that imply outbound crypto / Pulse / Following chain or watch APIs.
 * Keep in sync with steps/manifest.json (subset of chain + watch + bind steps).
 * Loaded before shared/cfs-always-on-automation.js in the service worker.
 */
(function (global) {
  'use strict';

  var CRYPTO_OR_PULSE_STEP_TYPES = [
    'solanaJupiterSwap',
    'solanaTransferSol',
    'solanaTransferSpl',
    'solanaEnsureTokenAccount',
    'solanaWrapSol',
    'solanaUnwrapSol',
    'solanaReadBalances',
    'solanaReadMint',
    'solanaReadMetaplexMetadata',
    'solanaPumpfunBuy',
    'solanaPumpfunSell',
    'solanaPumpMarketProbe',
    'solanaPumpOrJupiterBuy',
    'solanaPumpOrJupiterSell',
    'solanaSellabilityProbe',
    'solanaPerpsStatus',
    'raydiumAddLiquidity',
    'raydiumRemoveLiquidity',
    'raydiumSwapStandard',
    'raydiumCpmmAddLiquidity',
    'raydiumCpmmRemoveLiquidity',
    'raydiumClmmOpenPosition',
    'raydiumClmmOpenPositionFromLiquidity',
    'raydiumClmmCollectReward',
    'raydiumClmmCollectRewards',
    'raydiumClmmHarvestLockPosition',
    'raydiumClmmLockPosition',
    'raydiumClmmClosePosition',
    'raydiumClmmIncreasePosition',
    'raydiumClmmIncreasePositionFromLiquidity',
    'raydiumClmmDecreaseLiquidity',
    'raydiumClmmSwap',
    'raydiumClmmSwapBaseOut',
    'raydiumClmmRangeWatch',
    'raydiumClmmQuoteBaseIn',
    'raydiumClmmQuoteBaseOut',
    'meteoraDlmmAddLiquidity',
    'meteoraDlmmRemoveLiquidity',
    'meteoraDlmmClaimRewards',
    'meteoraDlmmRangeWatch',
    'meteoraCpammSwap',
    'meteoraCpammQuoteSwap',
    'meteoraCpammSwapExactOut',
    'meteoraCpammQuoteSwapExactOut',
    'meteoraCpammAddLiquidity',
    'meteoraCpammRemoveLiquidity',
    'meteoraCpammDecreaseLiquidity',
    'meteoraCpammClaimFees',
    'meteoraCpammClaimReward',
    'bscPancake',
    'pancakeFlash',
    'cryptoSimulateSwap',
    'bscTransferBnb',
    'bscTransferBep20',
    'bscAggregatorSwap',
    'bscSellabilityProbe',
    'bscWatchRefresh',
    'bscWatchReadActivity',
    'watchActivityFilterTxAge',
    'watchActivityFilterPriceDrift',
    'selectFollowingAccount',
    'rugcheckToken',
    'solanaWatchRefresh',
    'solanaWatchReadActivity',
    'bscQuery',
    'asterSpotMarket',
    'asterSpotAccount',
    'asterSpotTrade',
    'asterSpotWait',
    'asterFuturesMarket',
    'asterFuturesAccount',
    'asterFuturesAnalysis',
    'asterFuturesWait',
    'asterFuturesTrade',
    'asterUserStreamWait',
  ];

  var TYPE_SET = Object.create(null);
  for (var i = 0; i < CRYPTO_OR_PULSE_STEP_TYPES.length; i++) {
    TYPE_SET[CRYPTO_OR_PULSE_STEP_TYPES[i]] = true;
  }

  function walkActions(actions, visit) {
    if (!Array.isArray(actions)) return;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (!a || typeof a !== 'object') continue;
      visit(a);
      if (a.type === 'loop' && Array.isArray(a.steps)) {
        walkActions(a.steps, visit);
      }
      if (a.type === 'runWorkflow' && a.nestedWorkflow && a.nestedWorkflow.analyzed && Array.isArray(a.nestedWorkflow.analyzed.actions)) {
        walkActions(a.nestedWorkflow.analyzed.actions, visit);
      }
    }
  }

  function workflowUsesCryptoOrPulseWatch(wf) {
    if (!wf || typeof wf !== 'object') return false;
    var analyzed = wf.analyzed;
    var actions = analyzed && Array.isArray(analyzed.actions) ? analyzed.actions : [];
    var found = false;
    walkActions(actions, function (a) {
      var t = a.type != null ? String(a.type) : '';
      if (t && TYPE_SET[t]) found = true;
    });
    return found;
  }

  function libraryNeedsCryptoOrPulseWatch(stored) {
    var w = stored && stored.workflows;
    if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
    var ids = Object.keys(w);
    for (var i = 0; i < ids.length; i++) {
      if (workflowUsesCryptoOrPulseWatch(w[ids[i]])) return true;
    }
    return false;
  }

  global.__CFS_libraryNeedsCryptoOrPulseWatch = libraryNeedsCryptoOrPulseWatch;
  global.__CFS_workflowUsesCryptoOrPulseWatch = workflowUsesCryptoOrPulseWatch;
  /** Step `type` string → true if crypto/Pulse/watch (for unit test filtering, etc.). */
  global.__CFS_isCryptoOrPulseStepType = function (t) {
    return !!(t && TYPE_SET[String(t)]);
  };
})(typeof self !== 'undefined' ? self : globalThis);
