/**
 * Jupiter Prediction Market — Search events & get market data
 * Uses https://api.jup.ag/prediction/v1 API
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('jupiterPredictionSearch', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (jupiterPredictionSearch)');
    var row = ctx.currentRow || {};
    var r = function(f) { return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row, ctx.getRowValue, action).trim(); };

    var payload = {
      type: 'CFS_JUPITER_PREDICTION_SEARCH',
      operation: String(action.operation || 'searchEvents').trim(),
      query: r('query') || undefined,
      category: r('category') || undefined,
      filter: r('filter') || undefined,
      eventId: r('eventId') || undefined,
      marketId: r('marketId') || undefined,
    };

    var response = await ctx.sendMessage(payload);
    if (!response || !response.ok) throw new Error((response && response.error) || 'Prediction search failed');

    var varName = String(action.saveResultVariable || '').trim();
    if (varName && row && typeof row === 'object') {
      row[varName] = JSON.stringify(response.data || response);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
