/**
 * Shared JSON-RPC batch POST for Solana HTTPS endpoints (MV3 service worker).
 * Depends on fetch-resilient.js (__CFS_fetchWith429Backoff, __CFS_parseRetryAfterMs).
 * Used by watch-activity-price-filter.js and solana-watch.js.
 */
(function (global) {
  'use strict';

  function sleepRpc(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function shouldRetryRpc(err) {
    var st = err && err._cfsHttpStatus;
    if (typeof st === 'number' && st >= 500 && st <= 599) return true;
    if (typeof st === 'number' && st === 429) return true;
    var msg = err && err.message ? String(err.message) : String(err);
    if (/HTTP 5\d\d/.test(msg) || /HTTP 429/.test(msg)) return true;
    if (/Failed to fetch|NetworkError|network|Load failed|timed out/i.test(msg)) return true;
    return false;
  }

  function rpcBatchAttempt(rpcUrl, batchBody) {
    var body = JSON.stringify(batchBody);
    var init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    };
    var resilient = global.__CFS_fetchWith429Backoff;
    var p = typeof resilient === 'function' ? resilient(rpcUrl, init) : fetch(rpcUrl, init);
    return p
      .then(function (r) {
        if (!r.ok) {
          var e = new Error('RPC HTTP ' + r.status);
          e._cfsHttpStatus = r.status;
          var parseRa = global.__CFS_parseRetryAfterMs;
          e._cfsRetryAfterMs =
            typeof parseRa === 'function' && r.status === 429 ? parseRa(r) : 0;
          throw e;
        }
        return r.json();
      })
      .then(function (j) {
        if (!Array.isArray(j)) throw new Error('RPC batch: expected JSON array');
        return j;
      });
  }

  function rpcBatchCall(rpcUrl, batchBody) {
    var maxAttempts = 12;
    var delay = 500;
    function attempt(n) {
      return rpcBatchAttempt(rpcUrl, batchBody).catch(function (err) {
        if (!shouldRetryRpc(err)) throw err;
        if (n >= maxAttempts) throw err;
        var ra = err && err._cfsRetryAfterMs ? err._cfsRetryAfterMs : 0;
        var jittered = delay + Math.random() * delay;
        var wait = Math.min(Math.max(ra, jittered), 60000);
        return sleepRpc(wait).then(function () {
          delay = Math.min(delay * 2, 60000);
          return attempt(n + 1);
        });
      });
    }
    return attempt(0);
  }

  function decimalsFromGetAccountResult(res) {
    try {
      var dec =
        res &&
        res.value &&
        res.value.data &&
        res.value.data.parsed &&
        res.value.data.parsed.info &&
        res.value.data.parsed.info.decimals;
      return parseInt(dec, 10) || 9;
    } catch (_) {
      return 9;
    }
  }

  global.__CFS_solanaDecimalsFromGetAccountResult = decimalsFromGetAccountResult;

  /** Generic batch (e.g. getTransaction[]); same retry semantics as single RPC. */
  global.__CFS_solanaRpcJsonBatchCall = function (rpcUrl, batchBody) {
    return rpcBatchCall(rpcUrl, batchBody);
  };

  /** Two getAccountInfo jsonParsed calls in one HTTP round-trip → [dec0, dec1]. */
  global.__CFS_fetchTwoMintDecimalsSolanaRpc = function (rpcUrl, mintA, mintB) {
    var batch = [
      { jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [mintA, { encoding: 'jsonParsed' }] },
      { jsonrpc: '2.0', id: 2, method: 'getAccountInfo', params: [mintB, { encoding: 'jsonParsed' }] },
    ];
    return rpcBatchCall(rpcUrl, batch).then(function (arr) {
      var byId = Object.create(null);
      var k;
      for (k = 0; k < arr.length; k++) {
        var item = arr[k];
        if (item && item.id != null) byId[item.id] = item;
      }
      var r1 = byId[1];
      var r2 = byId[2];
      var d0 = r1 && !r1.error && r1.result != null ? decimalsFromGetAccountResult(r1.result) : 9;
      var d1 = r2 && !r2.error && r2.result != null ? decimalsFromGetAccountResult(r2.result) : 9;
      return [d0, d1];
    });
  };
})(typeof self !== 'undefined' ? self : globalThis);
