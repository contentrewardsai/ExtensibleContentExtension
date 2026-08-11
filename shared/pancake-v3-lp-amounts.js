/**
 * Pancake / Uniswap V3 LP amount helpers (range from %, amounts for liquidity).
 * CFS_PANCAKE_V3_LP — loaded via importScripts / unit-test script tags.
 */
(function (global) {
  'use strict';

  var Q96 = Math.pow(2, 96);

  function getHelpers() {
    return global.CFS_PANCAKE_V3 || global.__CFS_pancakeV3PriceTicks || null;
  }

  function tickToSqrtPriceX96(tick) {
    var price = Math.pow(1.0001, Number(tick));
    return Math.sqrt(price) * Q96;
  }

  function sqrtPriceX96ToNumber(sqrtPriceX96) {
    var s = Number(sqrtPriceX96);
    if (!(s > 0) || !Number.isFinite(s)) throw new Error('invalid sqrtPriceX96');
    return s / Q96;
  }

  /**
   * amount0 / amount1 for a given liquidity when current sqrt is between [sa, sb]
   * (Uniswap v3 getAmountsForLiquidity, float approximation).
   */
  function getAmountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, liquidity) {
    var sa = tickToSqrtPriceX96(tickLower) / Q96;
    var sb = tickToSqrtPriceX96(tickUpper) / Q96;
    if (sa > sb) {
      var tmp = sa;
      sa = sb;
      sb = tmp;
    }
    var sp = sqrtPriceX96ToNumber(sqrtPriceX96);
    var L = Number(liquidity);
    if (!(L > 0)) throw new Error('liquidity must be positive');
    var amount0 = 0;
    var amount1 = 0;
    if (sp <= sa) {
      amount0 = (L * (sb - sa)) / (sa * sb);
    } else if (sp < sb) {
      amount0 = (L * (sb - sp)) / (sp * sb);
      amount1 = L * (sp - sa);
    } else {
      amount1 = L * (sb - sa);
    }
    return { amount0: amount0, amount1: amount1 };
  }

  /**
   * Resolve below/above % from opts.
   * Prefer rangePercentBelow + rangePercentAbove; else symmetric rangePercent.
   * Either side may be omitted when the other is set (fills from rangePercent or the set side).
   */
  function resolveRangePercents(opts) {
    var o = opts || {};
    var hasBelow = o.rangePercentBelow != null && String(o.rangePercentBelow).trim() !== '';
    var hasAbove = o.rangePercentAbove != null && String(o.rangePercentAbove).trim() !== '';
    var hasSym = o.rangePercent != null && String(o.rangePercent).trim() !== '';
    var sym = hasSym ? Number(o.rangePercent) : NaN;
    var below;
    var above;
    if (hasBelow || hasAbove) {
      below = hasBelow ? Number(o.rangePercentBelow) : hasSym ? sym : Number(o.rangePercentAbove);
      above = hasAbove ? Number(o.rangePercentAbove) : hasSym ? sym : Number(o.rangePercentBelow);
    } else {
      if (!(sym > 0) || !Number.isFinite(sym)) throw new Error('rangePercent must be a positive number');
      below = sym;
      above = sym;
    }
    if (!(below > 0) || !Number.isFinite(below)) throw new Error('rangePercentBelow must be a positive number');
    if (!(above > 0) || !Number.isFinite(above)) throw new Error('rangePercentAbove must be a positive number');
    return { rangePercentBelow: below, rangePercentAbove: above, rangePercent: below === above ? below : '' };
  }

  /**
   * Build spacing-aligned tick range from % around current price (token1 per token0).
   * Supports asymmetric windows via rangePercentBelow / rangePercentAbove (e.g. −5% / +15%).
   */
  function rangeFromPercent(opts) {
    var H = getHelpers();
    if (!H) throw new Error('CFS_PANCAKE_V3 helpers not loaded');
    var pcts = resolveRangePercents(opts);
    var cur = Number(
      opts.currentPriceToken1PerToken0 != null ? opts.currentPriceToken1PerToken0 : opts.midPrice
    );
    if (!(cur > 0)) throw new Error('currentPriceToken1PerToken0 (or midPrice) required');
    var d0 = opts.decimals0 != null ? opts.decimals0 : opts.token0Decimals;
    var d1 = opts.decimals1 != null ? opts.decimals1 : opts.token1Decimals;
    var minP = cur * (1 - pcts.rangePercentBelow / 100);
    var maxP = cur * (1 + pcts.rangePercentAbove / 100);
    if (!(minP > 0)) minP = cur * 0.5;
    var range = H.pricesToTickRange({
      minPrice: minP,
      maxPrice: maxP,
      decimals0: d0,
      decimals1: d1,
      tickSpacing: opts.tickSpacing,
      priceDenomination: 'token1PerToken0',
    });
    return {
      tickLower: range.tickLower,
      tickUpper: range.tickUpper,
      minPrice: String(range.minPriceToken1PerToken0),
      maxPrice: String(range.maxPriceToken1PerToken0),
      minPriceToken1PerToken0: range.minPriceToken1PerToken0,
      maxPriceToken1PerToken0: range.maxPriceToken1PerToken0,
      rangePercent: pcts.rangePercent,
      rangePercentBelow: pcts.rangePercentBelow,
      rangePercentAbove: pcts.rangePercentAbove,
      midPrice: cur,
    };
  }

  /**
   * Next ±percent window centered on current price (after drift).
   * driftDirection is informational; center is always current price.
   */
  function restakeRange(opts) {
    var range = rangeFromPercent(opts);
    return Object.assign({ driftDirection: opts.driftDirection || '' }, range);
  }

  /**
   * Scale a unit liquidity so that amount0*price0 + amount1*price1 ≈ budget (same quote units).
   * price0/price1 = cost of 1 raw token unit in budget units (e.g. BNB wei per wei of token).
   */
  function scaleAmountsToBudget(amount0Unit, amount1Unit, price0, price1, budget) {
    var a0 = Number(amount0Unit) || 0;
    var a1 = Number(amount1Unit) || 0;
    var p0 = Number(price0) || 0;
    var p1 = Number(price1) || 0;
    var bud = Number(budget);
    if (!(bud > 0)) throw new Error('budget must be positive');
    var costUnit = a0 * p0 + a1 * p1;
    if (!(costUnit > 0)) throw new Error('zero cost for unit liquidity — check range vs price');
    var scale = bud / costUnit;
    return {
      amount0: a0 * scale,
      amount1: a1 * scale,
      scale: scale,
      costUnit: costUnit,
      budgetFor0: a0 * scale * p0,
      budgetFor1: a1 * scale * p1,
    };
  }

  /**
   * From V3 range + BNB→token quote prices, compute amount0/amount1 for a BNB budget.
   * opts: { sqrtPriceX96, tickLower, tickUpper, bnbBudgetWei, bnbPerToken0Wei, bnbPerToken1Wei }
   */
  function amountsFromBnbBudget(opts) {
    var o = opts || {};
    var unit = getAmountsForLiquidity(o.sqrtPriceX96, o.tickLower, o.tickUpper, 1e18);
    var scaled = scaleAmountsToBudget(
      unit.amount0,
      unit.amount1,
      o.bnbPerToken0Wei,
      o.bnbPerToken1Wei,
      o.bnbBudgetWei
    );
    return {
      amount0Desired: toWeiString(scaled.amount0),
      amount1Desired: toWeiString(scaled.amount1),
      amount0Float: scaled.amount0,
      amount1Float: scaled.amount1,
      bnbFor0Wei: toWeiString(scaled.budgetFor0),
      bnbFor1Wei: toWeiString(scaled.budgetFor1),
      scale: scaled.scale,
      unitAmount0: unit.amount0,
      unitAmount1: unit.amount1,
    };
  }

  /**
   * Same as amountsFromBnbBudget but priced in a stablecoin budget (USDT wei, etc.).
   * opts: { sqrtPriceX96, tickLower, tickUpper, stableBudgetWei, stablePerToken0Wei, stablePerToken1Wei }
   */
  function amountsFromStableBudget(opts) {
    var o = opts || {};
    var unit = getAmountsForLiquidity(o.sqrtPriceX96, o.tickLower, o.tickUpper, 1e18);
    var scaled = scaleAmountsToBudget(
      unit.amount0,
      unit.amount1,
      o.stablePerToken0Wei,
      o.stablePerToken1Wei,
      o.stableBudgetWei
    );
    return {
      amount0Desired: toWeiString(scaled.amount0),
      amount1Desired: toWeiString(scaled.amount1),
      amount0Float: scaled.amount0,
      amount1Float: scaled.amount1,
      stableFor0Wei: toWeiString(scaled.budgetFor0),
      stableFor1Wei: toWeiString(scaled.budgetFor1),
      scale: scaled.scale,
      unitAmount0: unit.amount0,
      unitAmount1: unit.amount1,
    };
  }

  /**
   * Cap amounts so they do not exceed available balances (min scale).
   */
  function capAmountsToAvailable(amount0Desired, amount1Desired, available0, available1) {
    var d0 = Number(amount0Desired) || 0;
    var d1 = Number(amount1Desired) || 0;
    var a0 = Number(available0) || 0;
    var a1 = Number(available1) || 0;
    var s0 = d0 > 0 ? a0 / d0 : Infinity;
    var s1 = d1 > 0 ? a1 / d1 : Infinity;
    var s = Math.min(s0, s1, 1);
    if (!(s > 0) || !Number.isFinite(s)) {
      return { amount0Desired: '0', amount1Desired: '0', scale: 0 };
    }
    return {
      amount0Desired: toWeiString(d0 * s),
      amount1Desired: toWeiString(d1 * s),
      scale: s,
    };
  }

  /**
   * Human-readable wei strings (floor) from float amounts.
   */
  function toWeiString(amountFloat) {
    if (!(amountFloat > 0) || !Number.isFinite(amountFloat)) return '0';
    if (amountFloat >= 1e15) {
      return String(Math.floor(amountFloat));
    }
    var s = amountFloat.toFixed(0);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) {
      return String(Math.floor(amountFloat));
    }
    return s;
  }

  /**
   * Distance to range edges (price %) + inventory composition.
   * pctToLower / pctToUpper match Pancake’s “+% to min/max” idea (decimals cancel in tick ratios).
   * Outside range: Inactive — pct on the breached side is 0; composition is ~100% one token.
   *
   * opts: { currentTick, tickLower, tickUpper, sqrtPriceX96?, liquidity?, decimals0?, decimals1? }
   */
  function edgeProximity(opts) {
    var o = opts || {};
    var tickLower = Number(o.tickLower);
    var tickUpper = Number(o.tickUpper);
    var currentTick = Number(o.currentTick);
    if (!Number.isFinite(tickLower) || !Number.isFinite(tickUpper) || !Number.isFinite(currentTick)) {
      throw new Error('edgeProximity: currentTick, tickLower, tickUpper required');
    }
    if (tickLower > tickUpper) {
      var tmpT = tickLower;
      tickLower = tickUpper;
      tickUpper = tmpT;
    }
    var inRange = currentTick >= tickLower && currentTick <= tickUpper;
    var driftDirection = '';
    if (currentTick < tickLower) driftDirection = 'below';
    else if (currentTick > tickUpper) driftDirection = 'above';

    // Geometric price ratios from ticks (decimals cancel).
    var ratioLo = Math.pow(1.0001, tickLower - currentTick); // min/price
    var ratioHi = Math.pow(1.0001, tickUpper - currentTick); // max/price
    var pctToLower;
    var pctToUpper;
    if (currentTick <= tickLower) {
      pctToLower = 0;
      pctToUpper = Math.max(0, (ratioHi - 1) * 100);
    } else if (currentTick >= tickUpper) {
      pctToLower = Math.max(0, (1 - ratioLo) * 100);
      pctToUpper = 0;
    } else {
      pctToLower = Math.max(0, (1 - ratioLo) * 100);
      pctToUpper = Math.max(0, (ratioHi - 1) * 100);
    }

    var composition0 = null;
    var composition1 = null;
    var amount0 = null;
    var amount1 = null;
    var sqrt = o.sqrtPriceX96 != null ? String(o.sqrtPriceX96).trim() : '';
    var liq = o.liquidity != null ? String(o.liquidity).trim() : '';
    if (sqrt && liq && Number(liq) > 0) {
      try {
        var amts = getAmountsForLiquidity(sqrt, tickLower, tickUpper, liq);
        amount0 = amts.amount0;
        amount1 = amts.amount1;
        var sp = sqrtPriceX96ToNumber(sqrt);
        var priceRaw = sp * sp;
        var v0 = amts.amount0 * priceRaw;
        var v1 = amts.amount1;
        var tot = v0 + v1;
        if (tot > 0 && Number.isFinite(tot)) {
          composition0 = v0 / tot;
          composition1 = v1 / tot;
        }
      } catch (_) {}
    }
    // Outside range without amounts: inventory is fully one side.
    if (composition0 == null && !inRange) {
      if (driftDirection === 'below') {
        composition0 = 1;
        composition1 = 0;
      } else if (driftDirection === 'above') {
        composition0 = 0;
        composition1 = 1;
      }
    }

    return {
      pctToLower: pctToLower,
      pctToUpper: pctToUpper,
      composition0: composition0,
      composition1: composition1,
      amount0: amount0,
      amount1: amount1,
      inRange: inRange,
      inactive: !inRange,
      driftDirection: driftDirection,
      currentTick: currentTick,
      tickLower: tickLower,
      tickUpper: tickUpper,
    };
  }

  var api = {
    tickToSqrtPriceX96: tickToSqrtPriceX96,
    getAmountsForLiquidity: getAmountsForLiquidity,
    resolveRangePercents: resolveRangePercents,
    rangeFromPercent: rangeFromPercent,
    restakeRange: restakeRange,
    scaleAmountsToBudget: scaleAmountsToBudget,
    amountsFromBnbBudget: amountsFromBnbBudget,
    amountsFromStableBudget: amountsFromStableBudget,
    capAmountsToAvailable: capAmountsToAvailable,
    toWeiString: toWeiString,
    edgeProximity: edgeProximity,
  };

  global.CFS_PANCAKE_V3_LP = api;
  global.__CFS_pancakeV3LpAmounts = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
