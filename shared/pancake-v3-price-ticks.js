/**
 * PancakeSwap / Uniswap V3 price ↔ tick helpers (human token1-per-token0 prices).
 * Loaded via importScripts / script tags as CFS_PANCAKE_V3_*.
 */
(function (global) {
  'use strict';

  var MIN_TICK = -887272;
  var MAX_TICK = 887272;
  var LN_1_0001 = Math.log(1.0001);

  function clampTick(tick) {
    var t = Math.trunc(Number(tick));
    if (!Number.isFinite(t)) throw new Error('tick must be a finite number');
    if (t < MIN_TICK) return MIN_TICK;
    if (t > MAX_TICK) return MAX_TICK;
    return t;
  }

  /** Snap tick to a multiple of tickSpacing (Uniswap nearestUsableTick). */
  function nearestUsableTick(tick, tickSpacing) {
    var spacing = Math.trunc(Number(tickSpacing));
    if (!(spacing > 0)) throw new Error('tickSpacing must be a positive integer');
    var t = clampTick(tick);
    var rounded = Math.round(t / spacing) * spacing;
    if (rounded < MIN_TICK) rounded = Math.ceil(MIN_TICK / spacing) * spacing;
    if (rounded > MAX_TICK) rounded = Math.floor(MAX_TICK / spacing) * spacing;
    return rounded;
  }

  /**
   * Human price of token1 per 1 token0 → raw tick (not spacing-aligned).
   * Matches Pancake “BTCB per 1 USDT” when token0=USDT, token1=BTCB.
   */
  function priceToken1PerToken0ToTick(price, decimals0, decimals1) {
    var p = Number(price);
    if (!(p > 0) || !Number.isFinite(p)) throw new Error('price must be a positive number');
    var d0 = Number(decimals0);
    var d1 = Number(decimals1);
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) throw new Error('decimals required');
    var adjusted = p * Math.pow(10, d1 - d0);
    if (!(adjusted > 0)) throw new Error('adjusted price must be positive');
    return clampTick(Math.floor(Math.log(adjusted) / LN_1_0001));
  }

  function tickToPriceToken1PerToken0(tick, decimals0, decimals1) {
    var t = clampTick(tick);
    var d0 = Number(decimals0);
    var d1 = Number(decimals1);
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) throw new Error('decimals required');
    return Math.pow(1.0001, t) * Math.pow(10, d0 - d1);
  }

  function priceToken0PerToken1ToTick(price, decimals0, decimals1) {
    var p = Number(price);
    if (!(p > 0) || !Number.isFinite(p)) throw new Error('price must be a positive number');
    return priceToken1PerToken0ToTick(1 / p, decimals0, decimals1);
  }

  function tickToPriceToken0PerToken1(tick, decimals0, decimals1) {
    var p = tickToPriceToken1PerToken0(tick, decimals0, decimals1);
    if (!(p > 0)) throw new Error('price is zero');
    return 1 / p;
  }

  /**
   * Convert min/max human prices to spacing-aligned ticks.
   * @param {object} opts
   * @param {string|number} opts.minPrice
   * @param {string|number} opts.maxPrice
   * @param {number} opts.decimals0
   * @param {number} opts.decimals1
   * @param {number} opts.tickSpacing
   * @param {'token1PerToken0'|'token0PerToken1'} [opts.priceDenomination]
   */
  function pricesToTickRange(opts) {
    var o = opts || {};
    var denom = String(o.priceDenomination || 'token1PerToken0').trim();
    var toTick =
      denom === 'token0PerToken1'
        ? priceToken0PerToken1ToTick
        : priceToken1PerToken0ToTick;
    var rawLo = toTick(o.minPrice, o.decimals0, o.decimals1);
    var rawHi = toTick(o.maxPrice, o.decimals0, o.decimals1);
    if (rawLo > rawHi) {
      var tmp = rawLo;
      rawLo = rawHi;
      rawHi = tmp;
    }
    var tickLower = nearestUsableTick(rawLo, o.tickSpacing);
    var tickUpper = nearestUsableTick(rawHi, o.tickSpacing);
    if (tickLower >= tickUpper) {
      tickUpper = nearestUsableTick(tickLower + Number(o.tickSpacing), o.tickSpacing);
    }
    if (tickLower >= tickUpper) {
      throw new Error('minPrice/maxPrice collapse to the same usable tick; widen the range');
    }
    return {
      tickLower: tickLower,
      tickUpper: tickUpper,
      rawTickLower: rawLo,
      rawTickUpper: rawHi,
      priceDenomination: denom === 'token0PerToken1' ? 'token0PerToken1' : 'token1PerToken0',
      minPriceToken1PerToken0: tickToPriceToken1PerToken0(tickLower, o.decimals0, o.decimals1),
      maxPriceToken1PerToken0: tickToPriceToken1PerToken0(tickUpper, o.decimals0, o.decimals1),
    };
  }

  /** Bitmap word index for a tick (V3 tickBitmap). */
  function tickToBitmapWord(tick, tickSpacing) {
    var spacing = Math.trunc(Number(tickSpacing));
    if (!(spacing > 0)) throw new Error('tickSpacing must be a positive integer');
    var t = Math.trunc(Number(tick));
    var compressed = Math.trunc(t / spacing);
    if (t < 0 && t % spacing !== 0) compressed -= 1;
    return compressed >> 8;
  }

  var api = {
    MIN_TICK: MIN_TICK,
    MAX_TICK: MAX_TICK,
    clampTick: clampTick,
    nearestUsableTick: nearestUsableTick,
    priceToken1PerToken0ToTick: priceToken1PerToken0ToTick,
    tickToPriceToken1PerToken0: tickToPriceToken1PerToken0,
    priceToken0PerToken1ToTick: priceToken0PerToken1ToTick,
    tickToPriceToken0PerToken1: tickToPriceToken0PerToken1,
    pricesToTickRange: pricesToTickRange,
    tickToBitmapWord: tickToBitmapWord,
  };

  global.CFS_PANCAKE_V3 = api;
  global.__CFS_pancakeV3PriceTicks = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
