/**
 * AsterDex futures REST (fapi) + spot public REST (sapi), Binance-compatible.
 * https://docs.asterdex.com/for-developers/aster-api/api-documentation
 */
(function () {
  'use strict';

  var ASTER_FAPI_BASE = 'https://fapi.asterdex.com';
  var ASTER_SAPI_BASE = 'https://sapi.asterdex.com';
  var STORAGE_API_KEY = 'cfsAsterFuturesApiKey';
  var STORAGE_API_SECRET = 'cfsAsterFuturesApiSecret';
  var STORAGE_TRADING_ENABLED = 'cfsAsterFuturesTradingEnabled';
  var STORAGE_MAX_NOTIONAL = 'cfsAsterFuturesMaxNotionalUsd';
  var STORAGE_SPOT_TRADING_ENABLED = 'cfsAsterSpotTradingEnabled';

  var EXCHANGE_INFO_TTL_MS = 3600000;
  var TIME_SKEW_TTL_MS = 300000;
  var _exchangeInfoCache = { at: 0, json: null };
  var _spotExchangeInfoCache = { at: 0, json: null };
  var _exchangeInfoInflightFapi = null;
  var _exchangeInfoInflightSapi = null;
  var _timeSkew = { offsetMs: 0, at: 0 };
  var _timeSkewSpot = { offsetMs: 0, at: 0 };

  /** IP request-weight pacing (Binance-style headers + exchangeInfo.rateLimits). */
  var ASTER_HOST_FAPI = 'fapi.asterdex.com';
  var ASTER_HOST_SAPI = 'sapi.asterdex.com';
  var MIN_INTER_REQUEST_MS = 40;
  var WEIGHT_HIGH_THRESHOLD = 0.85;
  var WEIGHT_BACKOFF_MS = 1000;
  var WEIGHT_BACKOFF_JITTER_MS = 500;
  var MAX_429_ATTEMPTS = 16;
  var MAX_429_SLEEP_MS = 60000;
  var MAX_PACE_ROUNDS = 3;
  /** host -> { limits, used, orderLimits, orderUsed, lastEndMs } */
  var _asterWeightByHost = {};

  function asterSleepMs(ms) {
    if (ms <= 0) return Promise.resolve();
    if (typeof cfsSleep === 'function') return cfsSleep(ms);
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function asterHostKeyFromUrl(url) {
    try {
      var h = new URL(url).hostname;
      if (h === ASTER_HOST_FAPI || h === ASTER_HOST_SAPI) return h;
    } catch (_) {}
    return '';
  }

  function asterEnsureWeightState(hostKey) {
    if (!hostKey) return null;
    if (!_asterWeightByHost[hostKey]) {
      _asterWeightByHost[hostKey] = {
        limits: {},
        used: {},
        orderLimits: {},
        orderUsed: {},
        lastEndMs: 0,
      };
    } else {
      var x = _asterWeightByHost[hostKey];
      if (!x.orderLimits) x.orderLimits = {};
      if (!x.orderUsed) x.orderUsed = {};
    }
    return _asterWeightByHost[hostKey];
  }

  /** True when the HTTP call counts against account ORDER rate limiters (not queryOrder GET). */
  function asterUrlAffectsOrderLimit(url, init) {
    var m = init && init.method ? String(init.method).toUpperCase() : 'GET';
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
    try {
      var path = new URL(url).pathname;
      if (/^\/fapi\/v1\/order$/i.test(path)) return m === 'POST' || m === 'DELETE' || m === 'PUT';
      if (/^\/fapi\/v1\/batchOrders/i.test(path)) return m === 'POST' || m === 'DELETE' || m === 'PUT';
      if (/^\/fapi\/v1\/allOpenOrders/i.test(path)) return m === 'DELETE';
      if (/^\/fapi\/v1\/openOrders$/i.test(path)) return m === 'DELETE';
      if (/^\/fapi\/v1\/countdownCancelAll/i.test(path)) return m === 'POST';
      if (/^\/api\/v3\/order$/i.test(path)) return m === 'POST' || m === 'DELETE';
      if (/^\/api\/v3\/batchOrders/i.test(path)) return m === 'POST' || m === 'DELETE';
      if (/^\/api\/v3\/openOrders/i.test(path)) return m === 'DELETE';
    } catch (_) {}
    return false;
  }

  function asterIntervalToLetter(interval) {
    var u = String(interval || '').toUpperCase();
    if (u === 'SECOND') return 's';
    if (u === 'MINUTE') return 'm';
    if (u === 'HOUR') return 'h';
    if (u === 'DAY') return 'd';
    return '';
  }

  function asterApplyExchangeInfoRateLimits(hostKey, exchangeInfoJson) {
    var st = asterEnsureWeightState(hostKey);
    if (!st || !exchangeInfoJson || !Array.isArray(exchangeInfoJson.rateLimits)) return;
    var lim = {};
    var olim = {};
    for (var ri = 0; ri < exchangeInfoJson.rateLimits.length; ri++) {
      var rl = exchangeInfoJson.rateLimits[ri];
      if (!rl) continue;
      var letter = asterIntervalToLetter(rl.interval);
      if (!letter) continue;
      var num = parseInt(rl.intervalNum, 10);
      if (!Number.isFinite(num) || num <= 0) continue;
      var wkey = String(num) + letter;
      var L = parseInt(rl.limit, 10);
      if (!Number.isFinite(L) || L <= 0) continue;
      if (rl.rateLimitType === 'REQUEST_WEIGHT') {
        lim[wkey] = lim[wkey] == null ? L : Math.min(lim[wkey], L);
      } else if (rl.rateLimitType === 'ORDER') {
        olim[wkey] = olim[wkey] == null ? L : Math.min(olim[wkey], L);
      }
    }
    st.limits = lim;
    st.orderLimits = olim;
  }

  function asterForEachHeader(headers, fn) {
    if (!headers) return;
    if (typeof headers.forEach === 'function') {
      headers.forEach(function (val, key) {
        fn(key, val);
      });
    } else {
      try {
        var keys = Object.keys(headers);
        for (var hi = 0; hi < keys.length; hi++) {
          fn(keys[hi], headers[keys[hi]]);
        }
      } catch (_) {}
    }
  }

  function asterRecordUsedWeightsFromHeaders(hostKey, headers) {
    var st = asterEnsureWeightState(hostKey);
    if (!st) return;
    var re = /^X-MBX-USED-WEIGHT-(\d+)([smhd])$/i;
    asterForEachHeader(headers, function (name, val) {
      var m = String(name).match(re);
      if (!m) return;
      var wkey = String(parseInt(m[1], 10)) + String(m[2]).toLowerCase();
      var used = parseInt(String(val), 10);
      if (Number.isFinite(used) && used >= 0) st.used[wkey] = used;
    });
  }

  function asterRecordOrderCountsFromHeaders(hostKey, headers) {
    var st = asterEnsureWeightState(hostKey);
    if (!st) return;
    var re = /^X-MBX-ORDER-COUNT-(\d+)([smhd])$/i;
    asterForEachHeader(headers, function (name, val) {
      var m = String(name).match(re);
      if (!m) return;
      var wkey = String(parseInt(m[1], 10)) + String(m[2]).toLowerCase();
      var used = parseInt(String(val), 10);
      if (Number.isFinite(used) && used >= 0) st.orderUsed[wkey] = used;
    });
  }

  async function asterPaceHighBuckets(limits, used) {
    for (var round = 0; round < MAX_PACE_ROUNDS; round++) {
      var uk = Object.keys(used);
      var hit = false;
      for (var ui = 0; ui < uk.length; ui++) {
        var k = uk[ui];
        var limit = limits[k];
        var u = used[k];
        if (!limit || !Number.isFinite(u)) continue;
        if (u >= limit * WEIGHT_HIGH_THRESHOLD) {
          hit = true;
          break;
        }
      }
      if (!hit) return;
      await asterSleepMs(WEIGHT_BACKOFF_MS + Math.random() * WEIGHT_BACKOFF_JITTER_MS);
    }
  }

  async function asterPaceBeforeFetch(url, init) {
    var hostKey = asterHostKeyFromUrl(url);
    if (!hostKey) return;
    var st = asterEnsureWeightState(hostKey);
    var now = Date.now();
    var gapWait = MIN_INTER_REQUEST_MS - (now - st.lastEndMs);
    if (gapWait > 0) await asterSleepMs(gapWait);
    await asterPaceHighBuckets(st.limits, st.used);
    if (asterUrlAffectsOrderLimit(url, init || {}) && Object.keys(st.orderLimits).length > 0) {
      await asterPaceHighBuckets(st.orderLimits, st.orderUsed);
    }
  }

  function asterPaceAfterFetch(hostKey) {
    if (!hostKey) return;
    var st = asterEnsureWeightState(hostKey);
    st.lastEndMs = Date.now();
  }

  var PUBLIC_OPS = {
    ping: { method: 'GET', path: '/fapi/v1/ping' },
    time: { method: 'GET', path: '/fapi/v1/time' },
    exchangeInfo: { method: 'GET', path: '/fapi/v1/exchangeInfo' },
    depth: { method: 'GET', path: '/fapi/v1/depth' },
    trades: { method: 'GET', path: '/fapi/v1/trades' },
    aggTrades: { method: 'GET', path: '/fapi/v1/aggTrades' },
    klines: { method: 'GET', path: '/fapi/v1/klines' },
    markPriceKlines: { method: 'GET', path: '/fapi/v1/markPriceKlines' },
    indexPriceKlines: { method: 'GET', path: '/fapi/v1/indexPriceKlines' },
    premiumIndex: { method: 'GET', path: '/fapi/v1/premiumIndex' },
    fundingRate: { method: 'GET', path: '/fapi/v1/fundingRate' },
    ticker24hr: { method: 'GET', path: '/fapi/v1/ticker/24hr' },
    tickerPrice: { method: 'GET', path: '/fapi/v1/ticker/price' },
    bookTicker: { method: 'GET', path: '/fapi/v1/ticker/bookTicker' },
  };

  /** Spot public GET paths (Binance spot /api/v3 style on sapi.asterdex.com). */
  var SPOT_PUBLIC_OPS = {
    ping: '/api/v3/ping',
    time: '/api/v3/time',
    exchangeInfo: '/api/v3/exchangeInfo',
    depth: '/api/v3/depth',
    trades: '/api/v3/trades',
    aggTrades: '/api/v3/aggTrades',
    klines: '/api/v3/klines',
    avgPrice: '/api/v3/avgPrice',
    ticker24hr: '/api/v3/ticker/24hr',
    tickerPrice: '/api/v3/ticker/price',
    bookTicker: '/api/v3/ticker/bookTicker',
  };

  var SPOT_SIGNED_GET = {
    account: '/api/v3/account',
    myTrades: '/api/v3/myTrades',
    openOrders: '/api/v3/openOrders',
    allOrders: '/api/v3/allOrders',
    queryOrder: '/api/v3/order',
  };

  var SIGNED_GET = {
    balance: '/fapi/v2/balance',
    account: '/fapi/v4/account',
    positionRisk: '/fapi/v2/positionRisk',
    openOrders: '/fapi/v1/openOrders',
    allOrders: '/fapi/v1/allOrders',
    queryOrder: '/fapi/v1/order',
    userTrades: '/fapi/v1/userTrades',
    income: '/fapi/v1/income',
    commissionRate: '/fapi/v1/commissionRate',
    adlQuantile: '/fapi/v1/adlQuantile',
    forceOrders: '/fapi/v1/forceOrders',
    historicalTrades: '/fapi/v1/historicalTrades',
    leverageBracket: '/fapi/v1/leverageBracket',
    getPositionMode: '/fapi/v1/positionSide/dual',
    getMultiAssetsMargin: '/fapi/v1/multiAssetsMargin',
    positionMarginHistory: '/fapi/v1/positionMargin/history',
  };

  var SIGNED_POST = {
    order: '/fapi/v1/order',
    batchOrders: '/fapi/v1/batchOrders',
    countdownCancelAll: '/fapi/v1/countdownCancelAll',
    leverage: '/fapi/v1/leverage',
    marginType: '/fapi/v1/marginType',
    positionMargin: '/fapi/v1/positionMargin',
    setPositionMode: '/fapi/v1/positionSide/dual',
    setMultiAssetsMargin: '/fapi/v1/multiAssetsMargin',
    listenKeyCreate: '/fapi/v1/listenKey',
    listenKeyKeepalive: '/fapi/v1/listenKey',
  };

  var SIGNED_DELETE = {
    order: '/fapi/v1/order',
    allOpenOrders: '/fapi/v1/allOpenOrders',
    batchOrders: '/fapi/v1/batchOrders',
    listenKeyClose: '/fapi/v1/listenKey',
  };

  function trimStr(v) {
    return v != null ? String(v).trim() : '';
  }

  function buildSignString(params) {
    var keys = Object.keys(params).filter(function (k) {
      return k !== 'signature' && params[k] != null && params[k] !== '';
    });
    keys.sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      parts.push(k + '=' + String(params[k]));
    }
    return parts.join('&');
  }

  function hexFromBuffer(buf) {
    var a = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < a.length; i++) {
      s += a[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  function hmacSha256Hex(secret, message) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (key) {
        return crypto.subtle.sign('HMAC', key, enc.encode(message));
      })
      .then(hexFromBuffer);
  }

  function appendQuery(url, obj) {
    var sp = new URLSearchParams();
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v != null && v !== '') sp.set(k, String(v));
    });
    var q = sp.toString();
    return q ? url + '?' + q : url;
  }

  function parseJsonSafe(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  /** When market/account code fetches exchangeInfo without the cache helper, still ingest rateLimits. */
  function asterTryApplyLimitsFromExchangeInfoBody(hostKey, url, res, json) {
    if (!hostKey || !res || !res.ok || !json || !Array.isArray(json.rateLimits)) return;
    try {
      var path = new URL(url).pathname;
      if (!/\/exchangeInfo$/i.test(path)) return;
      asterApplyExchangeInfoRateLimits(hostKey, json);
    } catch (_) {}
  }

  async function asterTransportFetch(url, init) {
    init = init || {};
    var m = init.method != null ? String(init.method).toUpperCase() : 'GET';
    if (m === 'GET' || m === 'HEAD') {
      var tiered = globalThis.__CFS_fetchGetTiered;
      if (typeof tiered === 'function') return tiered(url, init);
    }
    var fn = globalThis.__CFS_fetchWith429Backoff;
    if (typeof fn === 'function') return fn(url, init);
    return fetch(url, init);
  }

  async function fetchWithRetry(url, init, label) {
    var serverStreak = 0;
    var attempt429 = 0;
    for (;;) {
      var hostKey = asterHostKeyFromUrl(url);
      await asterPaceBeforeFetch(url, init);
      var res = await asterTransportFetch(url, init);
      var text = await res.text();
      var json = parseJsonSafe(text);
      if (hostKey) {
        try {
          asterRecordUsedWeightsFromHeaders(hostKey, res.headers);
          asterRecordOrderCountsFromHeaders(hostKey, res.headers);
          asterTryApplyLimitsFromExchangeInfoBody(hostKey, url, res, json);
        } catch (_) {}
        asterPaceAfterFetch(hostKey);
      }
      if (res.status === 503) {
        return { res: res, text: text, json: json, unknownState: true };
      }
      if (res.status === 418) {
        throw new Error('Aster API: HTTP 418 (IP may be banned). Back off and reduce request rate.');
      }
      if (res.status === 403) {
        throw new Error('Aster API: HTTP 403 (WAF or forbidden).');
      }
      if (res.status === 429) {
        serverStreak = 0;
        if (attempt429 >= MAX_429_ATTEMPTS) {
          return { res: res, text: text, json: json, unknownState: false };
        }
        attempt429++;
        var ra = res.headers.get('Retry-After');
        var raMs = ra ? parseInt(ra, 10) * 1000 : 0;
        if (!Number.isFinite(raMs) || raMs < 0) raMs = 0;
        var expMs = Math.min(
          MAX_429_SLEEP_MS,
          Math.floor(2000 * Math.pow(2, attempt429 - 1) + Math.random() * 800),
        );
        var sleep429 = raMs > 0 ? Math.min(MAX_429_SLEEP_MS, raMs) : expMs;
        try {
          var obs = globalThis.__CFS_cryptoObsWarn;
          if (typeof obs === 'function') {
            obs('aster', 'HTTP 429 backing off before retry', {
              label: label,
              attempt: attempt429,
              sleepMs: Math.round(sleep429),
              hostKey: hostKey || undefined,
            });
          }
        } catch (_) {}
        await asterSleepMs(sleep429);
        continue;
      }
      if (res.status >= 500 && res.status <= 599 && serverStreak < 8) {
        serverStreak++;
        var base = Math.min(32000, 1000 * Math.pow(2, serverStreak - 1));
        var jitter = Math.random() * 800;
        await asterSleepMs(base + jitter);
        continue;
      }
      return { res: res, text: text, json: json, unknownState: false };
    }
  }

  async function asterHttpGet(base, path, query) {
    var url = base + path;
    url = appendQuery(url, query || {});
    return fetchWithRetry(url, { method: 'GET' }, 'public');
  }

  async function asterPublicGet(path, query) {
    return asterHttpGet(ASTER_FAPI_BASE, path, query);
  }

  async function spotPublicGet(path, query) {
    return asterHttpGet(ASTER_SAPI_BASE, path, query);
  }

  async function getExchangeInfoCached() {
    var now = Date.now();
    if (_exchangeInfoCache.json && now - _exchangeInfoCache.at < EXCHANGE_INFO_TTL_MS) {
      asterApplyExchangeInfoRateLimits(ASTER_HOST_FAPI, _exchangeInfoCache.json);
      return _exchangeInfoCache.json;
    }
    if (_exchangeInfoInflightFapi) return _exchangeInfoInflightFapi;
    _exchangeInfoInflightFapi = (async function () {
      try {
        var out = await asterPublicGet('/fapi/v1/exchangeInfo', {});
        var r = await readResult(out);
        if (!r.ok) throw new Error(r.error || 'exchangeInfo failed');
        _exchangeInfoCache = { at: Date.now(), json: r.result };
        asterApplyExchangeInfoRateLimits(ASTER_HOST_FAPI, r.result);
        return r.result;
      } finally {
        _exchangeInfoInflightFapi = null;
      }
    })();
    return _exchangeInfoInflightFapi;
  }

  async function getSpotExchangeInfoCached() {
    var now = Date.now();
    if (_spotExchangeInfoCache.json && now - _spotExchangeInfoCache.at < EXCHANGE_INFO_TTL_MS) {
      asterApplyExchangeInfoRateLimits(ASTER_HOST_SAPI, _spotExchangeInfoCache.json);
      return _spotExchangeInfoCache.json;
    }
    if (_exchangeInfoInflightSapi) return _exchangeInfoInflightSapi;
    _exchangeInfoInflightSapi = (async function () {
      try {
        var out = await spotPublicGet('/api/v3/exchangeInfo', {});
        var r = await readResult(out);
        if (!r.ok) throw new Error(r.error || 'spot exchangeInfo failed');
        _spotExchangeInfoCache = { at: Date.now(), json: r.result };
        asterApplyExchangeInfoRateLimits(ASTER_HOST_SAPI, r.result);
        return r.result;
      } finally {
        _exchangeInfoInflightSapi = null;
      }
    })();
    return _exchangeInfoInflightSapi;
  }

  function findSymbolSpec(exchangeInfo, symbol) {
    var sym = trimStr(symbol).toUpperCase();
    if (!exchangeInfo || !sym || !Array.isArray(exchangeInfo.symbols)) return null;
    for (var i = 0; i < exchangeInfo.symbols.length; i++) {
      var s = exchangeInfo.symbols[i];
      if (String(s.symbol || '').toUpperCase() === sym) return s;
    }
    return null;
  }

  function getFilter(spec, filterType) {
    if (!spec || !Array.isArray(spec.filters)) return null;
    for (var i = 0; i < spec.filters.length; i++) {
      if (spec.filters[i].filterType === filterType) return spec.filters[i];
    }
    return null;
  }

  /** Decimal-safe enough for exchange filter checks (string quantities from API). */
  function decParts(s) {
    var t = String(s || '').trim();
    var neg = t[0] === '-';
    if (neg) t = t.slice(1);
    var dot = t.indexOf('.');
    var intPart = dot < 0 ? t : t.slice(0, dot);
    var frac = dot < 0 ? '' : t.slice(dot + 1);
    intPart = intPart.replace(/^0+/, '') || '0';
    return { neg: neg, intPart: intPart, frac: frac };
  }

  function decCmp(a, b) {
    var A = decParts(a);
    var B = decParts(b);
    if (A.neg !== B.neg) return A.neg ? -1 : 1;
    var sign = A.neg ? -1 : 1;
    var cmpInt = A.intPart.length - B.intPart.length;
    if (cmpInt !== 0) return sign * (cmpInt > 0 ? 1 : -1);
    if (A.intPart !== B.intPart) return sign * (A.intPart < B.intPart ? -1 : 1);
    var fa = A.frac;
    var fb = B.frac;
    var len = Math.max(fa.length, fb.length);
    fa = fa.padEnd(len, '0');
    fb = fb.padEnd(len, '0');
    if (fa === fb) return 0;
    return sign * (fa < fb ? -1 : 1);
  }

  function decModStep(qtyStr, stepStr, minStr) {
    var q = parseFloat(qtyStr);
    var step = parseFloat(stepStr);
    var minQ = parseFloat(minStr || '0');
    if (!Number.isFinite(q) || !Number.isFinite(step) || step <= 0) return null;
    var x = (q - minQ) / step;
    var rounded = Math.round(x);
    if (Math.abs(x - rounded) > 1e-8) return false;
    return true;
  }

  function decModTick(priceStr, tickStr) {
    var p = parseFloat(priceStr);
    var t = parseFloat(tickStr);
    if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return null;
    var x = p / t;
    var rounded = Math.round(x);
    return Math.abs(x - rounded) < 1e-8;
  }

  function decimalPlacesFromFilterString(s) {
    var t = String(s || '').trim();
    var i = t.indexOf('.');
    return i < 0 ? 0 : t.length - i - 1;
  }

  function trimDecimalString(num, maxDecimals) {
    var x = Number(num).toFixed(maxDecimals);
    if (x.indexOf('.') >= 0) x = x.replace(/\.?0+$/, '');
    return x;
  }

  /** Floor quantity to LOT_SIZE grid (Binance-style). */
  function floorQuantityToLot(qtyStr, lot) {
    var step = parseFloat(lot.stepSize);
    var minQ = parseFloat(lot.minQty || '0');
    var q = parseFloat(qtyStr);
    if (!Number.isFinite(q) || !Number.isFinite(step) || step <= 0) return String(qtyStr);
    var nSteps = Math.floor((q - minQ) / step + 1e-10);
    var adj = nSteps * step + minQ;
    var d = Math.max(decimalPlacesFromFilterString(lot.stepSize), decimalPlacesFromFilterString(lot.minQty));
    return trimDecimalString(adj, d);
  }

  /** Round price to nearest PRICE_FILTER tick. */
  function roundPriceToTick(priceStr, tickStr) {
    var t = parseFloat(tickStr);
    var p = parseFloat(priceStr);
    if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return String(priceStr);
    var adj = Math.round(p / t) * t;
    var d = decimalPlacesFromFilterString(tickStr);
    return trimDecimalString(adj, d);
  }

  async function roundPlaceOrderToExchangeFilters(po) {
    if (!po || !trimStr(po.symbol)) return;
    var info = await getExchangeInfoCached();
    var spec = findSymbolSpec(info, po.symbol);
    if (!spec) throw new Error('Unknown symbol in exchangeInfo: ' + po.symbol);
    var lot = getFilter(spec, 'LOT_SIZE');
    if (lot && po.quantity != null && String(po.quantity).trim() !== '') {
      po.quantity = floorQuantityToLot(String(po.quantity), lot);
    }
    var priceFilter = getFilter(spec, 'PRICE_FILTER');
    var ot = String(po.type || '').toUpperCase();
    var px = trimStr(po.price);
    if (priceFilter && px && (ot === 'LIMIT' || ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      po.price = roundPriceToTick(px, priceFilter.tickSize);
    }
    var sp = trimStr(po.stopPrice);
    if (priceFilter && sp && (ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      po.stopPrice = roundPriceToTick(sp, priceFilter.tickSize);
    }
  }

  async function validateOrderAgainstExchangeInfo(msg, po) {
    var info = await getExchangeInfoCached();
    var spec = findSymbolSpec(info, po.symbol);
    if (!spec) {
      throw new Error('Unknown symbol in exchangeInfo: ' + po.symbol);
    }
    var lot = getFilter(spec, 'LOT_SIZE');
    if (lot && po.quantity != null && String(po.quantity).trim() !== '') {
      if (decCmp(po.quantity, lot.minQty) < 0) throw new Error('quantity below minQty ' + lot.minQty);
      if (decCmp(po.quantity, lot.maxQty) > 0) throw new Error('quantity above maxQty ' + lot.maxQty);
      if (!decModStep(po.quantity, lot.stepSize, lot.minQty)) {
        throw new Error('quantity not on stepSize grid ' + lot.stepSize);
      }
    }
    var priceFilter = getFilter(spec, 'PRICE_FILTER');
    var ot = String(po.type || '').toUpperCase();
    var px = trimStr(po.price);
    if (priceFilter && px && (ot === 'LIMIT' || ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      if (decCmp(px, priceFilter.minPrice) < 0) throw new Error('price below minPrice');
      if (decCmp(px, priceFilter.maxPrice) > 0) throw new Error('price above maxPrice');
      if (!decModTick(px, priceFilter.tickSize)) throw new Error('price not on tickSize ' + priceFilter.tickSize);
    }
    var sp = trimStr(po.stopPrice);
    if (priceFilter && sp && (ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      if (!decModTick(sp, priceFilter.tickSize)) throw new Error('stopPrice not on tickSize ' + priceFilter.tickSize);
    }
    var minN = getFilter(spec, 'MIN_NOTIONAL');
    if (minN && po.quantity) {
      var notionalPx = px;
      if (!notionalPx && (ot === 'MARKET' || ot === 'STOP_MARKET' || ot === 'TAKE_PROFIT_MARKET')) {
        var pm = await asterPublicGet('/fapi/v1/premiumIndex', { symbol: po.symbol });
        var pr = await readResult(pm);
        if (pr.ok && pr.result && pr.result.markPrice) notionalPx = String(pr.result.markPrice);
      }
      if (notionalPx) {
        var n = parseFloat(po.quantity) * parseFloat(notionalPx);
        var minReq = parseFloat(minN.notional || minN.minNotional || '0');
        if (Number.isFinite(n) && Number.isFinite(minReq) && n < minReq) {
          throw new Error('notional ' + n + ' below MIN_NOTIONAL ' + minReq);
        }
      }
    }
  }

  async function roundSpotPlaceOrderToExchangeFilters(po) {
    if (!po || !trimStr(po.symbol)) return;
    var info = await getSpotExchangeInfoCached();
    var spec = findSymbolSpec(info, po.symbol);
    if (!spec) throw new Error('Unknown symbol in spot exchangeInfo: ' + po.symbol);
    var lot = getFilter(spec, 'LOT_SIZE');
    if (lot && po.quantity != null && String(po.quantity).trim() !== '') {
      po.quantity = floorQuantityToLot(String(po.quantity), lot);
    }
    var priceFilter = getFilter(spec, 'PRICE_FILTER');
    var ot = String(po.type || '').toUpperCase();
    var px = trimStr(po.price);
    if (priceFilter && px && (ot === 'LIMIT' || ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      po.price = roundPriceToTick(px, priceFilter.tickSize);
    }
    var sp = trimStr(po.stopPrice);
    if (priceFilter && sp && (ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      po.stopPrice = roundPriceToTick(sp, priceFilter.tickSize);
    }
  }

  async function validateSpotOrderAgainstExchangeInfo(msg, po) {
    var info = await getSpotExchangeInfoCached();
    var spec = findSymbolSpec(info, po.symbol);
    if (!spec) throw new Error('Unknown symbol in spot exchangeInfo: ' + po.symbol);
    var lot = getFilter(spec, 'LOT_SIZE');
    if (lot && po.quantity != null && String(po.quantity).trim() !== '') {
      if (decCmp(po.quantity, lot.minQty) < 0) throw new Error('quantity below minQty ' + lot.minQty);
      if (decCmp(po.quantity, lot.maxQty) > 0) throw new Error('quantity above maxQty ' + lot.maxQty);
      if (!decModStep(po.quantity, lot.stepSize, lot.minQty)) {
        throw new Error('quantity not on stepSize grid ' + lot.stepSize);
      }
    }
    var priceFilter = getFilter(spec, 'PRICE_FILTER');
    var ot = String(po.type || '').toUpperCase();
    var px = trimStr(po.price);
    if (priceFilter && px && (ot === 'LIMIT' || ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      if (decCmp(px, priceFilter.minPrice) < 0) throw new Error('price below minPrice');
      if (decCmp(px, priceFilter.maxPrice) > 0) throw new Error('price above maxPrice');
      if (!decModTick(px, priceFilter.tickSize)) throw new Error('price not on tickSize ' + priceFilter.tickSize);
    }
    var sp = trimStr(po.stopPrice);
    if (priceFilter && sp && (ot.indexOf('STOP') === 0 || ot.indexOf('TAKE_PROFIT') === 0)) {
      if (!decModTick(sp, priceFilter.tickSize)) throw new Error('stopPrice not on tickSize ' + priceFilter.tickSize);
    }
    var minN = getFilter(spec, 'MIN_NOTIONAL');
    if (minN && po.quantity) {
      var notionalPx = px;
      if (!notionalPx && (ot === 'MARKET' || ot === 'STOP_LOSS' || ot === 'TAKE_PROFIT')) {
        var tpm = await spotPublicGet('/api/v3/ticker/price', { symbol: po.symbol });
        var tpr = await readResult(tpm);
        if (tpr.ok && tpr.result && tpr.result.price) notionalPx = String(tpr.result.price);
      }
      if (notionalPx) {
        var n = parseFloat(po.quantity) * parseFloat(notionalPx);
        var minReq = parseFloat(minN.minNotional || minN.notional || '0');
        if (Number.isFinite(n) && Number.isFinite(minReq) && n < minReq) {
          throw new Error('notional ' + n + ' below MIN_NOTIONAL ' + minReq);
        }
      }
    }
  }

  async function getSigningTimestampMs() {
    var now = Date.now();
    if (now - _timeSkew.at < TIME_SKEW_TTL_MS && _timeSkew.at > 0) {
      return now + _timeSkew.offsetMs;
    }
    var out = await asterPublicGet('/fapi/v1/time', {});
    var r = await readResult(out);
    if (r.ok && r.result && r.result.serverTime != null) {
      var srv = Number(r.result.serverTime);
      if (Number.isFinite(srv)) {
        _timeSkew.offsetMs = srv - now;
        _timeSkew.at = now;
        return srv;
      }
    }
    return now;
  }

  async function getSigningTimestampMsSpot() {
    var now = Date.now();
    if (now - _timeSkewSpot.at < TIME_SKEW_TTL_MS && _timeSkewSpot.at > 0) {
      return now + _timeSkewSpot.offsetMs;
    }
    var out = await spotPublicGet('/api/v3/time', {});
    var r = await readResult(out);
    if (r.ok && r.result && r.result.serverTime != null) {
      var srv = Number(r.result.serverTime);
      if (Number.isFinite(srv)) {
        _timeSkewSpot.offsetMs = srv - now;
        _timeSkewSpot.at = now;
        return srv;
      }
    }
    return now;
  }

  async function getCredentials() {
    var data = await chrome.storage.local.get([
      STORAGE_API_KEY,
      STORAGE_API_SECRET,
      STORAGE_TRADING_ENABLED,
      STORAGE_MAX_NOTIONAL,
      STORAGE_SPOT_TRADING_ENABLED,
    ]);
    var key = trimStr(data[STORAGE_API_KEY]);
    var secret = trimStr(data[STORAGE_API_SECRET]);
    return {
      apiKey: key,
      apiSecret: secret,
      tradingEnabled: data[STORAGE_TRADING_ENABLED] === true,
      spotTradingEnabled: data[STORAGE_SPOT_TRADING_ENABLED] === true,
      maxNotionalUsd: parseFloat(data[STORAGE_MAX_NOTIONAL]) || 0,
    };
  }

  async function asterSignedRequest(method, path, extraParams, apiKey, apiSecret, recvWindow) {
    if (!apiKey || !apiSecret) {
      throw new Error('Aster API key/secret not configured (Settings → Aster API).');
    }
    var lastOut = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      var params = Object.assign({}, extraParams || {});
      params.timestamp = await getSigningTimestampMs();
      if (recvWindow != null && recvWindow !== '' && Number(recvWindow) > 0) {
        params.recvWindow = String(Math.floor(Number(recvWindow)));
      }
      var signPayload = buildSignString(params);
      var sig = await hmacSha256Hex(apiSecret, signPayload);
      var body = signPayload + '&signature=' + sig;
      var headers = { 'X-MBX-APIKEY': apiKey };
      var url = ASTER_FAPI_BASE + path;
      var init;
      if (method === 'GET') {
        url = url + '?' + body;
        init = { method: 'GET', headers: headers };
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        init = { method: method, headers: headers, body: body };
      }
      lastOut = await fetchWithRetry(url, init, 'signed');
      if (lastOut.unknownState) return lastOut;
      if (lastOut.res && lastOut.res.ok) return lastOut;
      var j = lastOut.json;
      if (j && j.code === -1022 && attempt === 0) {
        _timeSkew.at = 0;
        continue;
      }
      return lastOut;
    }
    return lastOut;
  }

  async function asterSignedSapiRequest(method, path, extraParams, apiKey, apiSecret, recvWindow) {
    if (!apiKey || !apiSecret) {
      throw new Error('Aster API key/secret not configured (Settings → Aster API).');
    }
    var lastOut = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      var params = Object.assign({}, extraParams || {});
      params.timestamp = await getSigningTimestampMsSpot();
      if (recvWindow != null && recvWindow !== '' && Number(recvWindow) > 0) {
        params.recvWindow = String(Math.floor(Number(recvWindow)));
      }
      var signPayload = buildSignString(params);
      var sig = await hmacSha256Hex(apiSecret, signPayload);
      var body = signPayload + '&signature=' + sig;
      var headers = { 'X-MBX-APIKEY': apiKey };
      var url = ASTER_SAPI_BASE + path;
      var init;
      if (method === 'GET') {
        url = url + '?' + body;
        init = { method: 'GET', headers: headers };
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        init = { method: method, headers: headers, body: body };
      }
      lastOut = await fetchWithRetry(url, init, 'signed');
      if (lastOut.unknownState) return lastOut;
      if (lastOut.res && lastOut.res.ok) return lastOut;
      var j = lastOut.json;
      if (j && j.code === -1022 && attempt === 0) {
        _timeSkewSpot.at = 0;
        continue;
      }
      return lastOut;
    }
    return lastOut;
  }

  function asterErrorFromBody(json, text, status) {
    var base;
    if (json && typeof json.code === 'number') {
      base = 'Aster API ' + json.code + ': ' + (json.msg || text || 'error');
    } else {
      base = 'Aster HTTP ' + status + ': ' + (text ? text.slice(0, 500) : '');
    }
    if (status === 429) {
      base +=
        ' (rate limited after retries; widen poll intervals, reduce parallel workflows, prefer user-stream WebSockets — see docs/INTEGRATIONS.md)';
    }
    return base;
  }

  async function readResult(out) {
    if (out.unknownState) {
      return {
        ok: false,
        error: 'Aster API returned HTTP 503; execution status unknown (may have succeeded).',
        unknownState: true,
        httpStatus: 503,
      };
    }
    var res = out.res;
    if (!res.ok) {
      return {
        ok: false,
        error: asterErrorFromBody(out.json, out.text, res.status),
        httpStatus: res.status,
        body: out.json != null ? out.json : out.text,
      };
    }
    return { ok: true, result: out.json != null ? out.json : out.text };
  }

  function pickMsgParams(msg, keys) {
    var o = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (msg[k] != null && msg[k] !== '') o[k] = msg[k];
    }
    return o;
  }

  function estimateNotionalUsd(symbol, quantity, priceOrMark) {
    var q = parseFloat(quantity);
    var p = parseFloat(priceOrMark);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return null;
    return q * p;
  }

  async function enforceMaxNotional(msg, creds) {
    var maxN = creds.maxNotionalUsd;
    if (!maxN || maxN <= 0) return;
    var sym = trimStr(msg.symbol);
    var qty = trimStr(msg.quantity);
    if (!sym || !qty) return;
    var price = trimStr(msg.price);
    var mark = null;
    var otCap = trimStr(msg.orderType) || trimStr(msg.type);
    if (otCap === 'CFS_ASTER_FUTURES') otCap = '';
    if (!price || otCap.toUpperCase() === 'MARKET') {
      var pm = await asterPublicGet('/fapi/v1/premiumIndex', { symbol: sym });
      var pr = await readResult(pm);
      if (pr.ok && pr.result && pr.result.markPrice) mark = String(pr.result.markPrice);
    }
    var n = estimateNotionalUsd(sym, qty, price || mark || '0');
    if (n != null && n > maxN) {
      throw new Error('Estimated order notional $' + n.toFixed(2) + ' exceeds Settings cap $' + maxN + '.');
    }
  }

  function enforceMaxStableTransfer(asset, amountStr, creds) {
    var maxN = creds.maxNotionalUsd;
    if (!maxN || maxN <= 0) return;
    var a = trimStr(asset).toUpperCase();
    if (a !== 'USDT' && a !== 'USDC' && a !== 'BUSD') return;
    var amt = parseFloat(amountStr);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (amt > maxN) {
      throw new Error(
        'Transfer amount exceeds Settings max est. notional / transfer cap $' + maxN + '.',
      );
    }
  }

  async function enforceMaxNotionalSpot(msg, creds) {
    var maxN = creds.maxNotionalUsd;
    if (!maxN || maxN <= 0) return;
    var sym = trimStr(msg.symbol);
    var qty = trimStr(msg.quantity);
    var qoq = trimStr(msg.quoteOrderQty);
    if (!sym || (!qty && !qoq)) return;
    var price = trimStr(msg.price);
    var otCap = trimStr(msg.orderType) || trimStr(msg.type);
    if (otCap === 'CFS_ASTER_FUTURES') otCap = '';
    var refPx = price;
    if (!refPx || otCap.toUpperCase() === 'MARKET') {
      var tp = await spotPublicGet('/api/v3/ticker/price', { symbol: sym });
      var tr = await readResult(tp);
      if (tr.ok && tr.result && tr.result.price) refPx = String(tr.result.price);
    }
    var n = null;
    if (qty && refPx) n = estimateNotionalUsd(sym, qty, refPx);
    else if (qoq) n = parseFloat(qoq);
    if (n != null && n > maxN) {
      throw new Error('Estimated spot order notional $' + n.toFixed(2) + ' exceeds Settings cap $' + maxN + '.');
    }
  }

  async function handlePublicOperation(operation, msg) {
    if (operation === 'symbolMeta') {
      var symM = trimStr(msg.symbol);
      if (!symM) throw new Error('symbol required');
      var info = await getExchangeInfoCached();
      var specM = findSymbolSpec(info, symM);
      if (!specM) throw new Error('symbol not found in exchangeInfo: ' + symM);
      return {
        ok: true,
        result: {
          symbol: specM.symbol,
          status: specM.status,
          baseAsset: specM.baseAsset,
          quoteAsset: specM.quoteAsset,
          filters: specM.filters || [],
          contractType: specM.contractType,
          marginAsset: specM.marginAsset,
        },
      };
    }
    var spec = PUBLIC_OPS[operation];
    if (!spec) throw new Error('Unknown public operation: ' + operation);
    var q = {};
    if (operation === 'depth') {
      q = pickMsgParams(msg, ['symbol', 'limit']);
      if (!q.symbol) throw new Error('symbol required');
    } else if (operation === 'trades') {
      q = pickMsgParams(msg, ['symbol', 'limit', 'fromId']);
      if (!q.symbol) throw new Error('symbol required');
    } else if (operation === 'aggTrades') {
      q = pickMsgParams(msg, ['symbol', 'fromId', 'startTime', 'endTime', 'limit']);
      if (!q.symbol) throw new Error('symbol required');
    } else if (operation === 'klines' || operation === 'markPriceKlines') {
      q = pickMsgParams(msg, ['symbol', 'interval', 'startTime', 'endTime', 'limit']);
      if (!q.symbol || !q.interval) throw new Error('symbol and interval required');
    } else if (operation === 'indexPriceKlines') {
      q = pickMsgParams(msg, ['pair', 'interval', 'startTime', 'endTime', 'limit']);
      if (!q.pair || !q.interval) throw new Error('pair and interval required');
    } else if (
      operation === 'premiumIndex' ||
      operation === 'fundingRate' ||
      operation === 'ticker24hr' ||
      operation === 'tickerPrice' ||
      operation === 'bookTicker'
    ) {
      q = pickMsgParams(msg, ['symbol']);
      if (operation === 'ticker24hr' && !q.symbol) {
        throw new Error('symbol required for ticker24hr (omit-all is heavy weight).');
      }
    }
    var out = await asterPublicGet(spec.path, q);
    return readResult(out);
  }

  async function handleSpotMarketOperation(operation, msg) {
    if (operation === 'symbolMeta') {
      var symS = trimStr(msg.symbol);
      if (!symS) throw new Error('symbol required');
      var sInfo = await getSpotExchangeInfoCached();
      var specS = findSymbolSpec(sInfo, symS);
      if (!specS) throw new Error('symbol not found in spot exchangeInfo: ' + symS);
      return {
        ok: true,
        result: {
          symbol: specS.symbol,
          status: specS.status,
          baseAsset: specS.baseAsset,
          quoteAsset: specS.quoteAsset,
          filters: specS.filters || [],
        },
      };
    }
    var spotPath = SPOT_PUBLIC_OPS[operation];
    if (!spotPath) throw new Error('Unknown spot public operation: ' + operation);
    var sq = {};
    if (operation === 'depth') {
      sq = pickMsgParams(msg, ['symbol', 'limit']);
      if (!sq.symbol) throw new Error('symbol required');
    } else if (operation === 'trades') {
      sq = pickMsgParams(msg, ['symbol', 'limit', 'fromId']);
      if (!sq.symbol) throw new Error('symbol required');
    } else if (operation === 'aggTrades') {
      sq = pickMsgParams(msg, ['symbol', 'fromId', 'startTime', 'endTime', 'limit']);
      if (!sq.symbol) throw new Error('symbol required');
    } else if (operation === 'klines') {
      sq = pickMsgParams(msg, ['symbol', 'interval', 'startTime', 'endTime', 'limit']);
      if (!sq.symbol || !sq.interval) throw new Error('symbol and interval required');
    } else if (operation === 'avgPrice') {
      sq = pickMsgParams(msg, ['symbol']);
      if (!sq.symbol) throw new Error('symbol required');
    } else if (operation === 'exchangeInfo') {
      sq = pickMsgParams(msg, ['symbol']);
    } else if (operation === 'ticker24hr' || operation === 'tickerPrice' || operation === 'bookTicker') {
      sq = pickMsgParams(msg, ['symbol']);
      if (operation === 'ticker24hr' && !sq.symbol) {
        throw new Error('symbol required for ticker24hr (omit-all is heavy weight).');
      }
    }
    var sOut = await spotPublicGet(spotPath, sq);
    return readResult(sOut);
  }

  async function handleUserStreamUrl(msg, creds) {
    var lk = trimStr(msg.listenKey);
    var create = msg.createListenKey !== false && msg.createListenKey !== 'false';
    if (!lk && !create) {
      return { ok: false, error: 'listenKey required when createListenKey is false' };
    }
    if (!lk) {
      var out = await asterSignedRequest('POST', '/fapi/v1/listenKey', {}, creds.apiKey, creds.apiSecret, msg.recvWindow);
      var r = await readResult(out);
      if (!r.ok) return r;
      lk = r.result && r.result.listenKey ? String(r.result.listenKey) : '';
      if (!lk) return { ok: false, error: 'listenKey missing in API response' };
    }
    var base = trimStr(msg.wsStreamBase);
    if (!base) base = 'wss://fstream.asterdex.com/ws';
    base = base.replace(/\/+$/, '');
    var wsUrl = base + '/' + lk;
    return {
      ok: true,
      result: {
        listenKey: lk,
        wsUrl: wsUrl,
        note: 'User stream URL (Binance-compatible). Renew with PUT /fapi/v1/listenKey before expiry (~60m).',
      },
    };
  }

  async function handleSpotUserStreamUrl(msg, creds) {
    var lkS = trimStr(msg.listenKey);
    var createS = msg.createListenKey !== false && msg.createListenKey !== 'false';
    if (!lkS && !createS) {
      return { ok: false, error: 'listenKey required when createListenKey is false' };
    }
    if (!lkS) {
      var su = await asterSignedSapiRequest(
        'POST',
        '/api/v3/userDataStream',
        {},
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var sur = await readResult(su);
      if (!sur.ok) return sur;
      lkS = sur.result && sur.result.listenKey ? String(sur.result.listenKey) : '';
      if (!lkS) return { ok: false, error: 'listenKey missing in API response' };
    }
    var baseS = trimStr(msg.wsStreamBase);
    if (!baseS) baseS = 'wss://sstream.asterdex.com/ws';
    baseS = baseS.replace(/\/+$/, '');
    var wsUrlS = baseS + '/' + lkS;
    return {
      ok: true,
      result: {
        listenKey: lkS,
        wsUrl: wsUrlS,
        note: 'Spot user stream URL. Renew with PUT /api/v3/userDataStream before expiry (~60m).',
      },
    };
  }

  async function handleSpotFuturesTransfer(msg, creds) {
    var asset = trimStr(msg.transferAsset);
    var amount =
      msg.transferAmount != null && String(msg.transferAmount).trim() !== ''
        ? String(msg.transferAmount).trim()
        : '';
    var typ = trimStr(msg.futuresTransferType);
    if (!asset || !amount) {
      throw new Error('futuresTransfer: transferAsset and transferAmount required');
    }
    if (!typ) throw new Error('futuresTransfer: futuresTransferType required (1=spot→UM, 2=UM→spot)');
    var tyNum = parseInt(typ, 10);
    if (tyNum !== 1 && tyNum !== 2) {
      throw new Error('futuresTransfer: futuresTransferType must be 1 or 2');
    }
    enforceMaxStableTransfer(asset, amount, creds);
    var ftOut = await asterSignedSapiRequest(
      'POST',
      '/sapi/v1/futures/transfer',
      { asset: asset.toUpperCase(), amount: amount, type: String(tyNum) },
      creds.apiKey,
      creds.apiSecret,
      msg.recvWindow,
    );
    return readResult(ftOut);
  }

  async function handleSpotSignedGet(operation, msg, creds) {
    if (operation === 'userStreamUrl') {
      return await handleSpotUserStreamUrl(msg, creds);
    }
    if (operation === 'listenKeyKeepalive') {
      var sklk = trimStr(msg.listenKey);
      if (!sklk) throw new Error('listenKey required for spot listenKeyKeepalive');
      var skp = await asterSignedSapiRequest(
        'PUT',
        '/api/v3/userDataStream',
        { listenKey: sklk },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(skp);
    }
    if (operation === 'listenKeyClose') {
      var sklc = trimStr(msg.listenKey);
      if (!sklc) throw new Error('listenKey required for spot listenKeyClose');
      var skc = await asterSignedSapiRequest(
        'DELETE',
        '/api/v3/userDataStream',
        { listenKey: sklc },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(skc);
    }
    if (operation === 'futuresTransferHistory') {
      var fhq = pickMsgParams(msg, ['startTime', 'endTime']);
      var tha = trimStr(msg.transferHistoryAsset);
      if (tha) fhq.asset = tha;
      var thp = trimStr(msg.transferHistoryPage);
      if (thp) fhq.current = thp;
      var ths = trimStr(msg.transferHistorySize);
      if (ths) fhq.size = ths;
      var fhh = await asterSignedSapiRequest(
        'GET',
        '/sapi/v1/futures/transfer',
        fhq,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(fhh);
    }
    var spotPath = SPOT_SIGNED_GET[operation];
    if (!spotPath) throw new Error('Unknown spot account operation: ' + operation);
    var spotKeysByOp = {
      account: [],
      myTrades: ['symbol', 'startTime', 'endTime', 'fromId', 'limit', 'orderId'],
      openOrders: ['symbol'],
      allOrders: ['symbol', 'orderId', 'startTime', 'endTime', 'limit'],
      queryOrder: ['symbol', 'orderId', 'origClientOrderId'],
    };
    var skeys = spotKeysByOp[operation] || [];
    var sq2 = pickMsgParams(msg, skeys);
    if (operation === 'queryOrder' && !sq2.orderId && !sq2.origClientOrderId) {
      throw new Error('orderId or origClientOrderId required');
    }
    if (operation === 'allOrders' && !sq2.symbol) throw new Error('symbol required');
    if (operation === 'myTrades' && !sq2.symbol) throw new Error('symbol required');
    var sgOut = await asterSignedSapiRequest(
      'GET',
      spotPath,
      sq2,
      creds.apiKey,
      creds.apiSecret,
      msg.recvWindow,
    );
    return readResult(sgOut);
  }

  async function handleSignedGet(operation, msg, creds) {
    var path = SIGNED_GET[operation];
    if (!path) throw new Error('Unknown signed read operation: ' + operation);
    var keysByOp = {
      balance: [],
      account: [],
      positionRisk: ['symbol'],
      openOrders: ['symbol'],
      allOrders: ['symbol', 'orderId', 'startTime', 'endTime', 'limit'],
      queryOrder: ['symbol', 'orderId', 'origClientOrderId'],
      userTrades: ['symbol', 'startTime', 'endTime', 'fromId', 'limit'],
      historicalTrades: ['symbol', 'limit', 'fromId'],
      income: ['symbol', 'incomeType', 'startTime', 'endTime', 'limit'],
      commissionRate: ['symbol'],
      adlQuantile: ['symbol'],
      forceOrders: ['symbol', 'autoCloseType', 'startTime', 'endTime', 'limit'],
      leverageBracket: ['symbol'],
      getPositionMode: [],
      getMultiAssetsMargin: [],
      positionMarginHistory: ['symbol', 'startTime', 'endTime', 'limit'],
    };
    var keys = keysByOp[operation] || [];
    var q = pickMsgParams(msg, keys);
    if (operation === 'queryOrder' && !q.orderId && !q.origClientOrderId) {
      throw new Error('orderId or origClientOrderId required');
    }
    if (operation === 'allOrders' && !q.symbol) throw new Error('symbol required');
    if (operation === 'userTrades' && !q.symbol) throw new Error('symbol required');
    if (operation === 'historicalTrades' && !q.symbol) throw new Error('symbol required');
    if (operation === 'commissionRate' && !q.symbol) throw new Error('symbol required');
    if (operation === 'positionMarginHistory' && !q.symbol) throw new Error('symbol required');
    var out = await asterSignedRequest('GET', path, q, creds.apiKey, creds.apiSecret, msg.recvWindow);
    return readResult(out);
  }

  async function handleAnalysis(operation, msg, creds) {
    var sym = trimStr(msg.symbol);
    if (!sym) throw new Error('symbol required');
    if (operation === 'decisionQuote') {
      var bookOut = await asterPublicGet('/fapi/v1/ticker/bookTicker', { symbol: sym });
      var bookR = await readResult(bookOut);
      if (!bookR.ok) return bookR;
      var premOut = await asterPublicGet('/fapi/v1/premiumIndex', { symbol: sym });
      var premR = await readResult(premOut);
      if (!premR.ok) return premR;
      var priceOut = await asterPublicGet('/fapi/v1/ticker/price', { symbol: sym });
      var priceR = await readResult(priceOut);
      var lastP = priceR.ok && priceR.result && priceR.result.price ? priceR.result.price : null;
      var b = bookR.result;
      var bid = parseFloat(b && b.bidPrice);
      var ask = parseFloat(b && b.askPrice);
      var mid = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : null;
      var spreadPct =
        mid && Number.isFinite(bid) && Number.isFinite(ask) && mid > 0
          ? ((ask - bid) / mid) * 100
          : null;
      var merged = {
        symbol: sym,
        bookTicker: bookR.result,
        premiumIndex: premR.result,
        lastPrice: lastP,
        mid: mid != null ? String(mid) : null,
        spreadPct: spreadPct != null ? String(spreadPct) : null,
      };
      return { ok: true, result: merged };
    }
    if (operation === 'feesAndFunding') {
      var prem = await asterPublicGet('/fapi/v1/premiumIndex', { symbol: sym });
      var pr = await readResult(prem);
      if (!pr.ok) return pr;
      var comm = await asterSignedRequest(
        'GET',
        '/fapi/v1/commissionRate',
        { symbol: sym },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var cr = await readResult(comm);
      if (!cr.ok) return cr;
      return {
        ok: true,
        result: {
          symbol: sym,
          commissionRate: cr.result,
          premiumIndex: pr.result,
        },
      };
    }
    if (operation === 'positionContext') {
      var pos = await asterSignedRequest(
        'GET',
        '/fapi/v2/positionRisk',
        { symbol: sym },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var posR = await readResult(pos);
      if (!posR.ok) return posR;
      var oo = await asterSignedRequest(
        'GET',
        '/fapi/v1/openOrders',
        { symbol: sym },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var ooR = await readResult(oo);
      if (!ooR.ok) return ooR;
      var orders = Array.isArray(ooR.result) ? ooR.result : [];
      var algoTypes = {
        STOP: 1,
        STOP_MARKET: 1,
        TAKE_PROFIT: 1,
        TAKE_PROFIT_MARKET: 1,
        TRAILING_STOP_MARKET: 1,
      };
      var algoCount = 0;
      for (var i = 0; i < orders.length; i++) {
        if (algoTypes[orders[i].type]) algoCount++;
      }
      var posRow = null;
      if (Array.isArray(posR.result)) {
        for (var j = 0; j < posR.result.length; j++) {
          if (String(posR.result[j].symbol || '').toUpperCase() === sym.toUpperCase()) {
            posRow = posR.result[j];
            break;
          }
        }
      }
      return {
        ok: true,
        result: {
          symbol: sym,
          position: posRow,
          openOrders: orders,
          openOrderCount: orders.length,
          openAlgoOrderCount: algoCount,
        },
      };
    }
    if (operation === 'rowSnapshot') {
      var premSnap = await asterPublicGet('/fapi/v1/premiumIndex', { symbol: sym });
      var premSnapR = await readResult(premSnap);
      if (!premSnapR.ok) return premSnapR;
      var bookSnap = await asterPublicGet('/fapi/v1/ticker/bookTicker', { symbol: sym });
      var bookSnapR = await readResult(bookSnap);
      if (!bookSnapR.ok) return bookSnapR;
      var posSnap = await asterSignedRequest(
        'GET',
        '/fapi/v2/positionRisk',
        { symbol: sym },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var posSnapR = await readResult(posSnap);
      if (!posSnapR.ok) return posSnapR;
      var ooSnap = await asterSignedRequest(
        'GET',
        '/fapi/v1/openOrders',
        { symbol: sym },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var ooSnapR = await readResult(ooSnap);
      if (!ooSnapR.ok) return ooSnapR;
      var ordersSnap = Array.isArray(ooSnapR.result) ? ooSnapR.result : [];
      var posRowSnap = null;
      if (Array.isArray(posSnapR.result)) {
        for (var ps = 0; ps < posSnapR.result.length; ps++) {
          if (String(posSnapR.result[ps].symbol || '').toUpperCase() === sym.toUpperCase()) {
            posRowSnap = posSnapR.result[ps];
            break;
          }
        }
      }
      return {
        ok: true,
        result: {
          symbol: sym,
          premiumIndex: premSnapR.result,
          bookTicker: bookSnapR.result,
          position: posRowSnap,
          openOrders: ordersSnap,
        },
      };
    }
    throw new Error('Unknown analysis operation: ' + operation);
  }

  async function handleTrade(operation, msg, creds) {
    if (operation === 'listenKeyCreate' || operation === 'listenKeyKeepalive' || operation === 'listenKeyClose') {
      if (operation === 'listenKeyCreate') {
        var c = await asterSignedRequest('POST', '/fapi/v1/listenKey', {}, creds.apiKey, creds.apiSecret, msg.recvWindow);
        return readResult(c);
      }
      if (operation === 'listenKeyKeepalive') {
        var lkK = trimStr(msg.listenKey);
        var kp = lkK ? { listenKey: lkK } : {};
        var k = await asterSignedRequest('PUT', '/fapi/v1/listenKey', kp, creds.apiKey, creds.apiSecret, msg.recvWindow);
        return readResult(k);
      }
      var lkC = trimStr(msg.listenKey);
      var cp = lkC ? { listenKey: lkC } : {};
      var cl = await asterSignedRequest('DELETE', '/fapi/v1/listenKey', cp, creds.apiKey, creds.apiSecret, msg.recvWindow);
      return readResult(cl);
    }
    if (!creds.tradingEnabled) {
      throw new Error('Aster futures trading is disabled (enable in Settings).');
    }
    if (operation === 'placeOrder') {
      var po = pickMsgParams(msg, [
        'symbol',
        'side',
        'positionSide',
        'timeInForce',
        'quantity',
        'price',
        'reduceOnly',
        'newClientOrderId',
        'stopPrice',
        'closePosition',
        'activationPrice',
        'callbackRate',
        'workingType',
        'priceProtect',
        'newOrderRespType',
      ]);
      var ot = trimStr(msg.orderType) || trimStr(msg.type);
      if (ot && ot !== 'CFS_ASTER_FUTURES') po.type = ot;
      if (!po.symbol || !po.side || !po.type) throw new Error('symbol, side, orderType required');
      if (!po.quantity && po.closePosition !== 'true' && po.closePosition !== true) {
        throw new Error('quantity required (unless closePosition)');
      }
      if (msg.roundToExchangeFilters === true || msg.roundToExchangeFilters === 'true') {
        await roundPlaceOrderToExchangeFilters(po);
      }
      await enforceMaxNotional(
        {
          symbol: po.symbol,
          quantity: po.quantity,
          price: po.price,
          orderType: po.type,
        },
        creds,
      );
      if (msg.validateExchangeFilters === true || msg.validateExchangeFilters === 'true') {
        await validateOrderAgainstExchangeInfo(msg, po);
      }
      if (msg.dryRun === true || msg.dryRun === 'true') {
        return { ok: true, result: { dryRun: true, placeParams: po } };
      }
      var out = await asterSignedRequest('POST', '/fapi/v1/order', po, creds.apiKey, creds.apiSecret, msg.recvWindow);
      return readResult(out);
    }
    if (operation === 'cancelOrder') {
      var co = pickMsgParams(msg, ['symbol', 'orderId', 'origClientOrderId']);
      if (!co.symbol) throw new Error('symbol required');
      if (!co.orderId && !co.origClientOrderId) throw new Error('orderId or origClientOrderId required');
      var del = await asterSignedRequest('DELETE', '/fapi/v1/order', co, creds.apiKey, creds.apiSecret, msg.recvWindow);
      return readResult(del);
    }
    if (operation === 'cancelAllOpen') {
      var ca = pickMsgParams(msg, ['symbol']);
      if (!ca.symbol) throw new Error('symbol required');
      var delAll = await asterSignedRequest(
        'DELETE',
        '/fapi/v1/allOpenOrders',
        ca,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(delAll);
    }
    if (operation === 'setLeverage') {
      var lev = pickMsgParams(msg, ['symbol', 'leverage']);
      if (!lev.symbol || lev.leverage == null) throw new Error('symbol and leverage required');
      var lo = await asterSignedRequest('POST', '/fapi/v1/leverage', lev, creds.apiKey, creds.apiSecret, msg.recvWindow);
      return readResult(lo);
    }
    if (operation === 'setMarginType') {
      var mt = pickMsgParams(msg, ['symbol', 'marginType']);
      if (!mt.symbol || !mt.marginType) throw new Error('symbol and marginType required');
      var mo = await asterSignedRequest('POST', '/fapi/v1/marginType', mt, creds.apiKey, creds.apiSecret, msg.recvWindow);
      return readResult(mo);
    }
    if (operation === 'batchOrders') {
      var raw = trimStr(msg.batchOrders);
      if (!raw) throw new Error('batchOrders JSON array required');
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length < 1 || arr.length > 5) {
        throw new Error('batchOrders must be a JSON array of 1–5 orders');
      }
      if (msg.roundToExchangeFilters === true || msg.roundToExchangeFilters === 'true') {
        for (var ri = 0; ri < arr.length; ri++) {
          if (arr[ri] && typeof arr[ri] === 'object') await roundPlaceOrderToExchangeFilters(arr[ri]);
        }
      }
      var bo = await asterSignedRequest(
        'POST',
        '/fapi/v1/batchOrders',
        { batchOrders: JSON.stringify(arr) },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(bo);
    }
    if (operation === 'replaceStopLoss' || operation === 'replaceTakeProfit') {
      var sym = trimStr(msg.symbol);
      if (!sym) throw new Error('symbol required');
      var cancel = pickMsgParams(msg, ['orderId', 'origClientOrderId']);
      cancel.symbol = sym;
      if (!cancel.orderId && !cancel.origClientOrderId) throw new Error('orderId or origClientOrderId to cancel');
      var delR = await asterSignedRequest(
        'DELETE',
        '/fapi/v1/order',
        cancel,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var dr = await readResult(delR);
      if (!dr.ok && !dr.unknownState) return dr;
      var place = pickMsgParams(msg, [
        'symbol',
        'side',
        'positionSide',
        'timeInForce',
        'quantity',
        'price',
        'reduceOnly',
        'newClientOrderId',
        'stopPrice',
        'workingType',
        'closePosition',
        'priceProtect',
      ]);
      place.symbol = sym;
      var ot2 = trimStr(msg.orderType) || trimStr(msg.type);
      if (ot2 === 'CFS_ASTER_FUTURES') ot2 = '';
      place.type = ot2 || (operation === 'replaceStopLoss' ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET');
      if (place.reduceOnly !== 'true' && place.reduceOnly !== true) place.reduceOnly = 'true';
      if (msg.roundToExchangeFilters === true || msg.roundToExchangeFilters === 'true') {
        await roundPlaceOrderToExchangeFilters(place);
      }
      await enforceMaxNotional(place, creds);
      if (msg.validateExchangeFilters === true || msg.validateExchangeFilters === 'true') {
        await validateOrderAgainstExchangeInfo(msg, place);
      }
      var po2 = await asterSignedRequest(
        'POST',
        '/fapi/v1/order',
        place,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var pr = await readResult(po2);
      if (dr.unknownState && pr.ok) {
        return {
          ok: true,
          result: { cancel: { unknownState: true }, place: pr.result },
          warning: 'Cancel returned 503 unknown; place succeeded — verify position manually.',
        };
      }
      if (!pr.ok) return pr;
      return { ok: true, result: { cancel: dr.result || dr, place: pr.result } };
    }
    if (operation === 'countdownCancelAll') {
      var cca = pickMsgParams(msg, ['symbol', 'countdownTime']);
      if (!cca.symbol || cca.countdownTime == null || String(cca.countdownTime).trim() === '') {
        throw new Error('symbol and countdownTime required');
      }
      var ccaOut = await asterSignedRequest(
        'POST',
        '/fapi/v1/countdownCancelAll',
        cca,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(ccaOut);
    }
    if (operation === 'cancelBatch') {
      var cbat = pickMsgParams(msg, ['symbol', 'orderIdList', 'origClientOrderIdList']);
      if (!cbat.symbol) throw new Error('symbol required');
      if (!cbat.orderIdList && !cbat.origClientOrderIdList) {
        throw new Error('orderIdList or origClientOrderIdList (JSON array string) required');
      }
      var cbatOut = await asterSignedRequest(
        'DELETE',
        '/fapi/v1/batchOrders',
        cbat,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(cbatOut);
    }
    if (operation === 'setPositionMode') {
      var dsp = msg.dualSidePosition;
      if (dsp == null || dsp === '') throw new Error('dualSidePosition required (true/false)');
      var dualStr =
        dsp === true || String(dsp).toLowerCase() === 'true' ? 'true' : 'false';
      var spm = await asterSignedRequest(
        'POST',
        '/fapi/v1/positionSide/dual',
        { dualSidePosition: dualStr },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(spm);
    }
    if (operation === 'setMultiAssetsMargin') {
      var mam = msg.multiAssetsMargin;
      if (mam == null || mam === '') throw new Error('multiAssetsMargin required (true/false)');
      var mamStr =
        mam === true || String(mam).toLowerCase() === 'true' ? 'true' : 'false';
      var smam = await asterSignedRequest(
        'POST',
        '/fapi/v1/multiAssetsMargin',
        { multiAssetsMargin: mamStr },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(smam);
    }
    if (operation === 'positionMargin') {
      var pmi = pickMsgParams(msg, ['symbol', 'amount', 'positionSide']);
      var marginTy = trimStr(msg.positionMarginType);
      if (marginTy) pmi.type = marginTy;
      if (!pmi.symbol || pmi.amount == null || String(pmi.amount).trim() === '' || pmi.type == null) {
        throw new Error('symbol, amount, positionMarginType required (1=add margin, 2=reduce)');
      }
      var pmo = await asterSignedRequest(
        'POST',
        '/fapi/v1/positionMargin',
        pmi,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(pmo);
    }
    if (operation === 'cancelStopLoss' || operation === 'cancelTakeProfit') {
      var symX = trimStr(msg.symbol);
      if (!symX) throw new Error('symbol required');
      var ooX = await asterSignedRequest(
        'GET',
        '/fapi/v1/openOrders',
        { symbol: symX },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      var ooXR = await readResult(ooX);
      if (!ooXR.ok) return ooXR;
      var listX = Array.isArray(ooXR.result) ? ooXR.result : [];
      var want = operation === 'cancelStopLoss' ? { STOP: 1, STOP_MARKET: 1 } : { TAKE_PROFIT: 1, TAKE_PROFIT_MARKET: 1 };
      var prefixX = trimStr(msg.clientOrderIdPrefix);
      for (var ix = 0; ix < listX.length; ix++) {
        var ox = listX[ix];
        if (!want[ox.type]) continue;
        if (prefixX && String(ox.clientOrderId || '').indexOf(prefixX) !== 0) continue;
        var cx = { symbol: symX };
        if (ox.orderId != null) cx.orderId = ox.orderId;
        else if (ox.origClientOrderId) cx.origClientOrderId = ox.origClientOrderId;
        else continue;
        var dx = await asterSignedRequest('DELETE', '/fapi/v1/order', cx, creds.apiKey, creds.apiSecret, msg.recvWindow);
        return readResult(dx);
      }
      return { ok: false, error: 'No matching open ' + (operation === 'cancelStopLoss' ? 'stop-loss' : 'take-profit') + ' order' };
    }
    throw new Error('Unknown trade operation: ' + operation);
  }

  async function handleSpotTrade(operation, msg, creds) {
    if (!creds.spotTradingEnabled) {
      throw new Error('Aster spot trading is disabled (enable in Settings).');
    }
    if (operation === 'placeOrder') {
      var spo0 = pickMsgParams(msg, [
        'symbol',
        'side',
        'timeInForce',
        'quantity',
        'quoteOrderQty',
        'price',
        'newClientOrderId',
        'stopPrice',
        'icebergQty',
        'newOrderRespType',
      ]);
      var ots = trimStr(msg.orderType) || trimStr(msg.type);
      if (ots && ots !== 'CFS_ASTER_FUTURES') spo0.type = ots;
      if (!spo0.symbol || !spo0.side || !spo0.type) throw new Error('symbol, side, orderType required');
      if (!spo0.quantity && !spo0.quoteOrderQty) throw new Error('quantity or quoteOrderQty required');
      if (msg.roundToExchangeFilters === true || msg.roundToExchangeFilters === 'true') {
        await roundSpotPlaceOrderToExchangeFilters(spo0);
      }
      await enforceMaxNotionalSpot(Object.assign({}, msg, spo0), creds);
      if (msg.validateExchangeFilters === true || msg.validateExchangeFilters === 'true') {
        await validateSpotOrderAgainstExchangeInfo(msg, spo0);
      }
      if (msg.dryRun === true || msg.dryRun === 'true') {
        return { ok: true, result: { dryRun: true, placeParams: spo0 } };
      }
      var spoOut = await asterSignedSapiRequest(
        'POST',
        '/api/v3/order',
        spo0,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(spoOut);
    }
    if (operation === 'cancelOrder') {
      var sco = pickMsgParams(msg, ['symbol', 'orderId', 'origClientOrderId']);
      if (!sco.symbol) throw new Error('symbol required');
      if (!sco.orderId && !sco.origClientOrderId) throw new Error('orderId or origClientOrderId required');
      var scd = await asterSignedSapiRequest(
        'DELETE',
        '/api/v3/order',
        sco,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(scd);
    }
    if (operation === 'cancelAllOpen') {
      var sca = pickMsgParams(msg, ['symbol']);
      if (!sca.symbol) throw new Error('symbol required');
      var scda = await asterSignedSapiRequest(
        'DELETE',
        '/api/v3/openOrders',
        sca,
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(scda);
    }
    if (operation === 'batchOrders') {
      var rawSp = trimStr(msg.batchOrders);
      if (!rawSp) throw new Error('batchOrders JSON array required');
      var arrSp = JSON.parse(rawSp);
      if (!Array.isArray(arrSp) || arrSp.length < 1 || arrSp.length > 5) {
        throw new Error('batchOrders must be a JSON array of 1–5 orders');
      }
      if (msg.roundToExchangeFilters === true || msg.roundToExchangeFilters === 'true') {
        for (var si = 0; si < arrSp.length; si++) {
          if (arrSp[si] && typeof arrSp[si] === 'object') await roundSpotPlaceOrderToExchangeFilters(arrSp[si]);
        }
      }
      var sbo = await asterSignedSapiRequest(
        'POST',
        '/api/v3/batchOrders',
        { batchOrders: JSON.stringify(arrSp) },
        creds.apiKey,
        creds.apiSecret,
        msg.recvWindow,
      );
      return readResult(sbo);
    }
    throw new Error('Unknown spot trade operation: ' + operation);
  }

  globalThis.__CFS_aster_futures = async function (msg) {
    try {
      var category = trimStr(msg.asterCategory);
      var operation = trimStr(msg.operation);
      if (!category || !operation) {
        return { ok: false, error: 'asterCategory and operation required' };
      }
      if (category === 'spotMarket') {
        return await handleSpotMarketOperation(operation, msg);
      }
      if (category === 'market') {
        return await handlePublicOperation(operation, msg);
      }
      var creds = await getCredentials();
      if (category === 'account') {
        if (!creds.apiKey || !creds.apiSecret) {
          return { ok: false, error: 'Configure Aster API key and secret in Settings.' };
        }
        if (operation === 'userStreamUrl') {
          return await handleUserStreamUrl(msg, creds);
        }
        return await handleSignedGet(operation, msg, creds);
      }
      if (category === 'analysis') {
        if (!creds.apiKey || !creds.apiSecret) {
          return { ok: false, error: 'Configure Aster API key and secret in Settings.' };
        }
        if (operation === 'decisionQuote') {
          return await handleAnalysis('decisionQuote', msg, creds);
        }
        return await handleAnalysis(operation, msg, creds);
      }
      if (category === 'trade') {
        if (!creds.apiKey || !creds.apiSecret) {
          return { ok: false, error: 'Configure Aster API key and secret in Settings.' };
        }
        return await handleTrade(operation, msg, creds);
      }
      if (category === 'spotAccount') {
        if (!creds.apiKey || !creds.apiSecret) {
          return { ok: false, error: 'Configure Aster API key and secret in Settings.' };
        }
        if (operation === 'futuresTransfer') {
          return await handleSpotFuturesTransfer(msg, creds);
        }
        return await handleSpotSignedGet(operation, msg, creds);
      }
      if (category === 'spotTrade') {
        if (!creds.apiKey || !creds.apiSecret) {
          return { ok: false, error: 'Configure Aster API key and secret in Settings.' };
        }
        return await handleSpotTrade(operation, msg, creds);
      }
      return { ok: false, error: 'Unknown asterCategory: ' + category };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };
})();
