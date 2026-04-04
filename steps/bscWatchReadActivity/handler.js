/**
 * Read recent BSC Following watch activity. Message: CFS_BSC_WATCH_GET_ACTIVITY.
 */
(function () {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
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

  window.__CFS_registerStepHandler('bscWatchReadActivity', async function (action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscWatchReadActivity)');
    var sendMessage = ctx.sendMessage;
    var row = ctx.currentRow || {};
    var getRowValue = ctx.getRowValue;

    var limitStr = trimResolved(row, getRowValue, action, action.limit);
    var limit = parseInt(limitStr, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 40;
    if (limit > 100) limit = 100;

    var response = await sendMessage({ type: 'CFS_BSC_WATCH_GET_ACTIVITY', limit: limit });
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? String(response.error) : 'BSC watch read failed');
    }

    var activity = Array.isArray(response.activity) ? response.activity.slice() : [];
    var applyClientFilters = action.applyClientFilters !== false;
    if (applyClientFilters) {
      var filterAddr = trimResolved(row, getRowValue, action, action.filterAddress).trim().toLowerCase();
      if (filterAddr) {
        if (/^0x[0-9a-f]{40}$/.test(filterAddr)) {
          activity = activity.filter(function (r) {
            return String(r.address || '').trim().toLowerCase() === filterAddr;
          });
        } else {
          activity = activity.filter(function (r) {
            return String(r.address || '').toLowerCase().indexOf(filterAddr) !== -1;
          });
        }
      }

      var sinceStr = trimResolved(row, getRowValue, action, action.sinceTimestampMs);
      if (sinceStr) {
        var since = parseInt(sinceStr, 10);
        if (Number.isFinite(since)) {
          activity = activity.filter(function (r) { return (r.ts || 0) >= since; });
        }
      }
    }

    var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
    if (!keyVar) return;

    if (row && typeof row === 'object') {
      var payload = { activity: activity, latest: activity[0] || null, count: activity.length };
      try {
        row[keyVar] = JSON.stringify(payload);
      } catch (_) {
        row[keyVar] = String(payload);
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
