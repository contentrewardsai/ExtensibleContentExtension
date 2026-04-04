/**
 * Shared fetch with 429 / Retry-After handling for crypto and indexer HTTP (MV3 service worker).
 * Loaded via importScripts before solana-swap.js, solana-watch.js, bsc-watch.js.
 *
 * __CFS_fetchGetTiered(url, init, opts): GET helper — fetchGetResilient → fetchWith429Backoff → fetch
 * (reads globals at call time so partial tooling still gets 429 handling when the full helper is absent).
 */
(function (global) {
  'use strict';

  var RETRY_AFTER_MAX_MS = 120000;

  function sleepMs(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function sleepAbortable(ms, signal) {
    if (!signal) return sleepMs(ms);
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise(function (resolve, reject) {
      var onAbort = function () {
        clearTimeout(tid);
        signal.removeEventListener('abort', onAbort);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      var tid = setTimeout(function () {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort);
    });
  }

  function parseRetryAfterMs(res) {
    try {
      var ra = res.headers.get('Retry-After');
      if (ra == null || ra === '') return 0;
      var s = String(ra).trim();
      if (/^\d+$/.test(s)) {
        var sec = parseInt(s, 10);
        if (sec > 0) return Math.min(sec * 1000, RETRY_AFTER_MAX_MS);
        return 0;
      }
      var when = Date.parse(s);
      if (Number.isFinite(when)) {
        var delta = when - Date.now();
        if (delta > 0) return Math.min(delta, RETRY_AFTER_MAX_MS);
      }
    } catch (_) {}
    return 0;
  }

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ max429Retries?: number, initialDelayMs?: number }} [opts]
   * @returns {Promise<Response>}
   */
  async function fetchWith429Backoff(url, init, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var max429 = opts.max429Retries != null ? Math.max(0, Number(opts.max429Retries)) : 12;
    var delay = Math.max(100, Number(opts.initialDelayMs) || 500);
    var signal = init && init.signal;
    for (var attempt = 0; attempt <= max429; attempt++) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      var res = await fetch(url, init);
      if (res.status !== 429) return res;
      if (attempt === max429) return res;
      var jittered = delay + Math.random() * delay;
      var fromHeader = parseRetryAfterMs(res);
      var wait = Math.min(Math.max(jittered, fromHeader), RETRY_AFTER_MAX_MS);
      try {
        var logFn = global.__CFS_cryptoObsWarn;
        if (typeof logFn === 'function') {
          var host = 'http';
          try {
            host = new URL(url).hostname;
          } catch (_) {}
          logFn('fetch', 'HTTP 429 backing off before retry', {
            attempt: attempt + 1,
            waitMs: Math.round(wait),
            host: host,
          });
        }
      } catch (_) {}
      await sleepAbortable(wait, signal);
      delay = Math.min(delay * 2, 60000);
    }
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return fetch(url, init);
  }

  /**
   * Idempotent GET-style: retry 429 (via fetchWith429Backoff loop per attempt) and transient 5xx.
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ max429Retries?: number, max5xxAttempts?: number }} [opts]
   */
  async function fetchGetResilient(url, init, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var max5xx = opts.max5xxAttempts != null ? Math.max(1, Number(opts.max5xxAttempts)) : 10;
    var serverStreak = 0;
    var signal = init && init.signal;
    for (;;) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      var res = await fetchWith429Backoff(url, init, { max429Retries: opts.max429Retries });
      if (res.ok) return res;
      if (res.status === 429) {
        serverStreak = 0;
        var raMs = parseRetryAfterMs(res);
        await sleepAbortable(raMs > 0 ? raMs : 2000, signal);
        continue;
      }
      if (res.status >= 500 && res.status <= 599 && serverStreak < max5xx) {
        serverStreak++;
        var base = Math.min(32000, 2000 * Math.pow(2, serverStreak - 1));
        await sleepAbortable(base + Math.random() * 1000, signal);
        continue;
      }
      return res;
    }
  }

  /**
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ max429Retries?: number, max5xxAttempts?: number }} [opts] options forwarded when using fetchGetResilient
   */
  function fetchGetTiered(url, init, opts) {
    var getRes = global.__CFS_fetchGetResilient;
    var backoff = global.__CFS_fetchWith429Backoff;
    if (typeof getRes === 'function') return getRes(url, init, opts);
    if (typeof backoff === 'function') return backoff(url, init);
    return fetch(url, init);
  }

  global.__CFS_parseRetryAfterMs = parseRetryAfterMs;
  global.__CFS_fetchWith429Backoff = fetchWith429Backoff;
  global.__CFS_fetchGetResilient = fetchGetResilient;
  global.__CFS_fetchGetTiered = fetchGetTiered;
})(typeof self !== 'undefined' ? self : globalThis);
