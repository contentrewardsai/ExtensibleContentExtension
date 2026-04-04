/**
 * Validates optional Apify run query params on APIFY_RUN messages (server timeout, memory, sync dataset page, etc.).
 * Loaded by background/service-worker.js via importScripts; unit tests load via test/unit-tests.html.
 * Node: scripts/verify-apify-run-query-validation.mjs
 */
(function (globalObj) {
  'use strict';

  var RUN_TIMEOUT_SECS_MAX = 604800; // 7 days (Apify allows long server timeouts)
  var RUN_MEMORY_MBYTES_MAX = 131072; // 128 GB upper sanity bound
  var RUN_MAX_ITEMS_MAX = 100000000; // pay-per-result cap
  var MAX_TOTAL_CHARGE_USD_MAX = 1000000; // $1M sanity bound
  var SYNC_DATASET_LIMIT_MAX = 1000000;
  var SYNC_DATASET_OFFSET_MAX = 9007199254740991; // Number.MAX_SAFE_INTEGER

  /**
   * @param {object} msg APIFY_RUN payload
   * @returns {string|null} error message or null if ok
   */
  function CFS_apifyRunQueryParamsValidationError(msg) {
    if (!msg || typeof msg !== 'object') return null;

    var t = msg.apifyRunTimeoutSecs;
    if (t != null && t !== '') {
      var tn = Number(t);
      if (!Number.isFinite(tn) || tn <= 0 || tn > RUN_TIMEOUT_SECS_MAX) {
        return 'apifyRunTimeoutSecs must be between 1 and ' + RUN_TIMEOUT_SECS_MAX + ' seconds when set';
      }
    }

    var m = msg.apifyRunMemoryMbytes;
    if (m != null && m !== '') {
      var mn = Number(m);
      if (!Number.isFinite(mn) || mn <= 0 || mn > RUN_MEMORY_MBYTES_MAX) {
        return 'apifyRunMemoryMbytes must be between 1 and ' + RUN_MEMORY_MBYTES_MAX + ' when set';
      }
    }

    var mx = msg.apifyRunMaxItems;
    if (mx != null && mx !== '') {
      var mxn = Number(mx);
      if (!Number.isFinite(mxn) || mxn <= 0 || mxn > RUN_MAX_ITEMS_MAX) {
        return 'apifyRunMaxItems must be between 1 and ' + RUN_MAX_ITEMS_MAX + ' when set';
      }
    }

    var usd = msg.apifyMaxTotalChargeUsd;
    if (usd != null && usd !== '') {
      var un = Number(usd);
      if (!Number.isFinite(un) || un <= 0 || un > MAX_TOTAL_CHARGE_USD_MAX) {
        return 'apifyMaxTotalChargeUsd must be a positive number at most ' + MAX_TOTAL_CHARGE_USD_MAX + ' when set';
      }
    }

    var lim = msg.apifySyncDatasetLimit;
    if (lim != null && lim !== '') {
      var ln = Number(lim);
      if (!Number.isFinite(ln) || ln <= 0 || ln > SYNC_DATASET_LIMIT_MAX) {
        return 'apifySyncDatasetLimit must be between 1 and ' + SYNC_DATASET_LIMIT_MAX + ' when set';
      }
    }

    var off = msg.apifySyncDatasetOffset;
    if (off != null && off !== '') {
      var on = Number(off);
      if (!Number.isFinite(on) || on < 0 || on > SYNC_DATASET_OFFSET_MAX) {
        return 'apifySyncDatasetOffset must be between 0 and ' + SYNC_DATASET_OFFSET_MAX + ' when set';
      }
    }

    var w = msg.apifyStartWaitForFinishSecs;
    if (w != null && w !== '') {
      var wn = Number(w);
      if (!Number.isFinite(wn) || wn < 1 || wn > 60) {
        return 'apifyStartWaitForFinishSecs must be between 1 and 60 when set';
      }
    }

    return null;
  }

  globalObj.CFS_apifyRunQueryParamsValidationError = CFS_apifyRunQueryParamsValidationError;
})(typeof globalThis !== 'undefined' ? globalThis : this);
