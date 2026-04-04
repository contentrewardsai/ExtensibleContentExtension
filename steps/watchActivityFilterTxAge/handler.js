/**
 * Filter watch activity JSON by max age of on-chain block time (Solana targetBlockTimeUnix, BSC timeStamp).
 */
(function () {
  'use strict';

  var resolveTemplate =
    typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate
      ? CFS_templateResolver.resolveTemplate
      : function (str, row, getRowValue, action) {
          if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
          return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
            var k = key.trim();
            var v = getRowValue(row, k);
            return v != null ? String(v) : '';
          });
        };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  function parseActivityPayload(raw) {
    if (raw == null || raw === '') return null;
    var s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  function blockTimeUnixSec(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.targetBlockTimeUnix != null && Number.isFinite(Number(row.targetBlockTimeUnix))) {
      return Number(row.targetBlockTimeUnix);
    }
    if (row.timeStamp != null && String(row.timeStamp).trim() !== '') {
      var ts = parseInt(String(row.timeStamp).trim(), 10);
      if (Number.isFinite(ts) && ts > 0) return ts;
    }
    return null;
  }

  window.__CFS_registerStepHandler(
    'watchActivityFilterTxAge',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (watchActivityFilterTxAge)');
      var row = ctx.currentRow || {};
      var getRowValue = ctx.getRowValue;

      var inVar = trimResolved(row, getRowValue, action, action.inputVariable);
      if (!inVar) throw new Error('watchActivityFilterTxAge: set input variable name');

      var rawIn = getRowValue(row, inVar);
      var payload = parseActivityPayload(rawIn);
      if (!payload || typeof payload !== 'object') {
        throw new Error('watchActivityFilterTxAge: variable "' + inVar + '" is not valid JSON { activity, latest, count }');
      }

      var activity = Array.isArray(payload.activity) ? payload.activity.slice() : [];
      var maxSecStr = trimResolved(row, getRowValue, action, action.maxAgeSec);
      var maxSec = parseFloat(maxSecStr);
      if (!Number.isFinite(maxSec) || maxSec <= 0) {
        throw new Error('watchActivityFilterTxAge: maxAgeSec must be a positive number (seconds)');
      }

      var passNoTime = action.passRowsWithoutBlockTime === true;
      var nowSec = Date.now() / 1000;
      var filtered = activity.filter(function (r) {
        var bt = blockTimeUnixSec(r);
        if (bt == null) return passNoTime;
        var age = nowSec - bt;
        return age <= maxSec;
      });

      var outVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
      if (!outVar) throw new Error('watchActivityFilterTxAge: set save result variable');

      var out = { activity: filtered, latest: filtered[0] || null, count: filtered.length };
      try {
        row[outVar] = JSON.stringify(out);
      } catch (_) {
        row[outVar] = String(out);
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
