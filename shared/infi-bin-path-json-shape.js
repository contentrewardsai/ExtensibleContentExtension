/**
 * Infinity multi-hop infiBinPathJson shape (no RPC, no ethers).
 * Loaded by background/service-worker.js via importScripts; Node: require() from scripts/verify-infi-bin-path-json.cjs.
 * Used by background/bsc-evm.js parseInfiBinPathJson (import this script before bsc-evm.js).
 */
(function (globalObj) {
  'use strict';

  var MAX_HOPS = 8;
  var MAX_LEN = 32000;

  /**
   * @param {string} raw
   * @returns {{ ok: true, hops: object[] } | { ok: false, error: string }}
   */
  function CFS_parseInfiBinPathJsonShape(raw) {
    if (typeof raw !== 'string' || !String(raw).trim()) {
      return { ok: false, error: 'infiBinPathJson: non-empty string required' };
    }
    if (raw.length > MAX_LEN) {
      return { ok: false, error: 'infiBinPathJson too long' };
    }
    var hops;
    try {
      hops = JSON.parse(raw);
    } catch (_) {
      return { ok: false, error: 'infiBinPathJson: invalid JSON' };
    }
    if (!Array.isArray(hops) || hops.length === 0) {
      return { ok: false, error: 'infiBinPathJson must be a non-empty array' };
    }
    if (hops.length > MAX_HOPS) {
      return { ok: false, error: 'infiBinPathJson: at most 8 hops' };
    }
    var hi;
    for (hi = 0; hi < hops.length; hi++) {
      var h = hops[hi];
      if (!h || typeof h !== 'object' || Array.isArray(h)) {
        return { ok: false, error: 'infiBinPathJson: hop ' + hi + ' must be an object' };
      }
      var nextRaw = h.intermediateCurrency;
      if (nextRaw == null || String(nextRaw).trim() === '') {
        return { ok: false, error: 'infiBinPathJson: hop ' + hi + ' intermediateCurrency required' };
      }
      var feeStr = String(h.infinityFee != null ? h.infinityFee : '').trim();
      var stepStr = String(h.binStep != null ? h.binStep : '').trim();
      if (!feeStr || !stepStr) {
        return { ok: false, error: 'infiBinPathJson: hop ' + hi + ' infinityFee and binStep required' };
      }
      var feeN = Number(feeStr);
      if (!Number.isFinite(feeN) || feeN < 0 || feeN > 0xffffff) {
        return { ok: false, error: 'infiBinPathJson: hop ' + hi + ' infinityFee must be uint24' };
      }
      var binStepN = Number(stepStr);
      if (!Number.isFinite(binStepN) || binStepN < 1 || binStepN > 100) {
        return { ok: false, error: 'infiBinPathJson: hop ' + hi + ' binStep must be 1–100' };
      }
      if (h.infinityHooksRegistrationJson != null && String(h.infinityHooksRegistrationJson).trim()) {
        try {
          var parsedReg = JSON.parse(String(h.infinityHooksRegistrationJson).trim());
          if (!parsedReg || typeof parsedReg !== 'object' || Array.isArray(parsedReg)) {
            return {
              ok: false,
              error: 'infiBinPathJson: hop ' + hi + ' infinityHooksRegistrationJson must be JSON object',
            };
          }
        } catch (_) {
          return { ok: false, error: 'infiBinPathJson: hop ' + hi + ' infinityHooksRegistrationJson invalid JSON' };
        }
      }
    }
    return { ok: true, hops: hops };
  }

  /**
   * @param {string} currencyInRaw
   * @param {object[]} hops
   * @returns {string|null} error message or null
   */
  function CFS_infiBinPathCurrencyChainError(currencyInRaw, hops) {
    var current = String(currencyInRaw || '').trim().toLowerCase();
    if (!current) {
      return 'infiBinPathJson: currencyIn required for path chain';
    }
    var hi;
    for (hi = 0; hi < hops.length; hi++) {
      var next = String(hops[hi].intermediateCurrency).trim().toLowerCase();
      if (next === current) {
        return 'infiBinPathJson: hop ' + hi + ' intermediateCurrency must differ from path input';
      }
      current = next;
    }
    return null;
  }

  globalObj.CFS_parseInfiBinPathJsonShape = CFS_parseInfiBinPathJsonShape;
  globalObj.CFS_infiBinPathCurrencyChainError = CFS_infiBinPathCurrencyChainError;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CFS_parseInfiBinPathJsonShape: CFS_parseInfiBinPathJsonShape,
      CFS_infiBinPathCurrencyChainError: CFS_infiBinPathCurrencyChainError,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
