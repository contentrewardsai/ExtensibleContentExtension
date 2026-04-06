(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterPredictionSearch', {
    label: 'Jupiter Prediction — Search Events & Markets',
    defaultAction: { type: 'jupiterPredictionSearch', runIf: '', operation: 'searchEvents', query: '', category: '', filter: '', eventId: '', marketId: '', saveResultVariable: 'predictionResult' },
    getSummary: function(a) { var op = (a.operation || 'searchEvents').trim(); var q = (a.query || '').trim(); return op === 'searchEvents' && q ? 'Prediction search: ' + q.slice(0, 20) : 'Prediction ' + op; },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(a) { var v = (a.saveResultVariable || '').trim(); return v ? [{ rowKey: v, label: v, hint: 'prediction result JSON' }] : []; },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var ops = ['searchEvents','listEvents','getEvent','getMarket','getOrderbook','tradingStatus'];
      var cats = ['','crypto','sports','politics','esports','culture','economics','tech'];
      var filters = ['','new','live','trending'];
      var cur = (action.operation||'searchEvents').trim();
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Query Jupiter Prediction Markets — binary YES/NO events aggregating Polymarket & Kalshi liquidity. Prices in micro USD (1,000,000 = $1).</p>' +
        '<div class="step-field"><label>Run only if</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Operation</label><select data-field="operation" data-step="' + i + '">' + ops.map(function(o){return '<option value="'+o+'"'+(cur===o?' selected':'')+'>'+o+'</option>';}).join('') + '</select></div>' +
        '<div class="step-field"><label>Search query</label><input type="text" data-field="query" data-step="' + i + '" value="' + e((action.query||'').trim()) + '" placeholder="nba, bitcoin, election"></div>' +
        '<div class="step-field"><label>Category</label><select data-field="category" data-step="' + i + '">' + cats.map(function(c){return '<option value="'+c+'"'+((action.category||'')===c?' selected':'')+'>'+(c||'All')+'</option>';}).join('') + '</select></div>' +
        '<div class="step-field"><label>Filter</label><select data-field="filter" data-step="' + i + '">' + filters.map(function(f){return '<option value="'+f+'"'+((action.filter||'')===f?' selected':'')+'>'+(f||'All')+'</option>';}).join('') + '</select></div>' +
        '<div class="step-field"><label>Event ID</label><input type="text" data-field="eventId" data-step="' + i + '" value="' + e((action.eventId||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Market ID</label><input type="text" data-field="marketId" data-step="' + i + '" value="' + e((action.marketId||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save result to variable</label><input type="text" data-field="saveResultVariable" data-step="' + i + '" value="' + e((action.saveResultVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterPredictionSearch', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); return el ? el.value : ''; };
      return { type: 'jupiterPredictionSearch', runIf: (g('runIf')||'').trim(), operation: (g('operation')||'searchEvents').trim(), query: (g('query')||'').trim(), category: (g('category')||'').trim(), filter: (g('filter')||'').trim(), eventId: (g('eventId')||'').trim(), marketId: (g('marketId')||'').trim(), saveResultVariable: (g('saveResultVariable')||'').trim() };
    },
  });
})();
