/**
 * Filter watch activity by price drift vs fresh quote (Solana Jupiter / BSC Pancake V2). Message: CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW.
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

  function nzDrift(x) {
    var n = parseFloat(String(x || '').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resolveDriftMaxForSide(buy, sell, both, side) {
    var s = String(side || '').toLowerCase();
    if (s === 'buy') {
      if (nzDrift(buy) != null) return nzDrift(buy);
      return nzDrift(both);
    }
    if (s === 'sell') {
      if (nzDrift(sell) != null) return nzDrift(sell);
      return nzDrift(both);
    }
    return null;
  }

  window.__CFS_registerStepHandler(
    'watchActivityFilterPriceDrift',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (watchActivityFilterPriceDrift)');
      var sendMessage = ctx.sendMessage;
      var row = ctx.currentRow || {};
      var getRowValue = ctx.getRowValue;

      var inVar = trimResolved(row, getRowValue, action, action.inputVariable);
      if (!inVar) throw new Error('watchActivityFilterPriceDrift: set input variable name');

      var rawIn = getRowValue(row, inVar);
      var payload = parseActivityPayload(rawIn);
      if (!payload || typeof payload !== 'object') {
        throw new Error('watchActivityFilterPriceDrift: variable "' + inVar + '" is not valid JSON');
      }

      var activity = Array.isArray(payload.activity) ? payload.activity.slice() : [];
      var driftBuy = trimResolved(row, getRowValue, action, action.maxDriftPercentBuy);
      var driftSell = trimResolved(row, getRowValue, action, action.maxDriftPercentSell);
      var driftBoth = trimResolved(row, getRowValue, action, action.maxDriftPercentBoth);
      var amountTpl = trimResolved(row, getRowValue, action, action.amountRaw);
      var slipStr = trimResolved(row, getRowValue, action, action.slippageBps);
      var slip = parseInt(slipStr, 10);
      if (!Number.isFinite(slip)) slip = 50;
      var chainExplicit = trimResolved(row, getRowValue, action, action.chain).toLowerCase();

      var filtered = [];
      for (var i = 0; i < activity.length; i++) {
        var ar = activity[i];
        if (!ar || typeof ar !== 'object') continue;

        var side = String(ar.side || '').toLowerCase();
        var maxPct = resolveDriftMaxForSide(driftBuy, driftSell, driftBoth, side);
        if (maxPct == null) {
          var c1 = Object.assign({}, ar);
          delete c1.priceDriftFilterDropped;
          c1.priceFilterSkippedReason = 'no_max_drift';
          filtered.push(c1);
          continue;
        }

        var chain = chainExplicit;
        if (!chain) {
          if (ar.chain === 'bsc' || (ar.txHash && String(ar.txHash).indexOf('0x') === 0)) chain = 'bsc';
          else if (ar.signature) chain = 'solana';
        }

        var res = await sendMessage({
          type: 'CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW',
          chain: chain,
          row: ar,
          amountRaw: amountTpl,
          slippageBps: slip,
          maxDriftPercent: maxPct,
        });

        if (!res || res.ok === false) {
          throw new Error((res && res.error) ? String(res.error) : 'Price drift check failed');
        }

        if (res.passed === true) {
          var c2 = Object.assign({}, ar);
          delete c2.priceDriftFilterDropped;
          if (res.priceFilterSkippedReason) c2.priceFilterSkippedReason = res.priceFilterSkippedReason;
          else if (res.driftRatio != null && Number.isFinite(res.driftRatio)) {
            c2.priceDriftRatio = res.driftRatio;
          }
          filtered.push(c2);
          continue;
        }

        if (res.reason === 'drift_exceeded' || res.reason === 'quote_fail') {
          continue;
        }

        var c3 = Object.assign({}, ar);
        delete c3.priceDriftFilterDropped;
        c3.priceFilterSkippedReason = res.priceFilterSkippedReason || res.reason || 'unknown';
        filtered.push(c3);
      }

      var outVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
      if (!outVar) throw new Error('watchActivityFilterPriceDrift: set save result variable');

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
