(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('rowListFilter', {
    label: 'Filter / slice row list',
    defaultAction: {
      type: 'rowListFilter',
      runIf: '',
      sourceVariable: 'items',
      saveToVariable: 'items',
      filterRunIf: '',
      invertFilter: false,
      offset: '',
      limit: '',
    },
    getSummary: function(action) {
      var s = (action.sourceVariable || '').trim() || '?';
      var o = (action.saveToVariable || '').trim() || '?';
      var f = (action.filterRunIf || '').trim();
      var inv = !!action.invertFilter;
      var parts = [s + ' → ' + o];
      if (f) {
        parts.push((inv ? 'exclude where ' : 'where ') + (f.length > 24 ? f.slice(0, 24) + '…' : f));
      }
      return parts.join(', ');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var src = (action.sourceVariable || '').trim();
      var out = (action.saveToVariable || '').trim();
      var filt = (action.filterRunIf || '').trim();
      var inv = !!action.invertFilter;
      var off = action.offset;
      var lim = action.limit;
      var offStr = off != null && off !== '' && Number.isFinite(Number(off)) ? String(off) : '';
      var limStr = lim != null && lim !== '' && Number.isFinite(Number(lim)) ? String(lim) : '';
      var body =
        '<div class="step-field"><label>Run only if (optional; skip whole step)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Source list (row variable)</label><input type="text" data-field="sourceVariable" data-step="' + i + '" value="' + escapeHtml(src) + '" placeholder="items"></div>' +
        '<div class="step-field"><label>Save result to (row variable)</label><input type="text" data-field="saveToVariable" data-step="' + i + '" value="' + escapeHtml(out) + '" placeholder="items"></div>' +
        '<div class="step-field"><label>Keep element when (optional; runIf DSL per item)</label><input type="text" data-field="filterRunIf" data-step="' + i + '" value="' + escapeHtml(filt) + '" placeholder="{{status}} === active"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="invertFilter" data-step="' + i + '"' + (inv ? ' checked' : '') + '> Invert: keep items where the expression is <strong>false</strong> (drop when true)</label></div>' +
        '<div class="step-field"><label>Offset after filter (optional)</label><input type="text" data-field="offset" data-step="' + i + '" value="' + escapeHtml(offStr) + '" placeholder="0"></div>' +
        '<div class="step-field"><label>Limit after filter (optional)</label><input type="text" data-field="limit" data-step="' + i + '" value="' + escapeHtml(limStr) + '" placeholder="e.g. 10"></div>' +
        '<span class="step-hint">Per element: parent row merged with object items; use <code>_item</code> for scalar list elements.</span>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('rowListFilter', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      function getChk(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el && el.type === 'checkbox' ? el.checked : false;
      }
      var out = { type: 'rowListFilter' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.sourceVariable = (getVal('sourceVariable') || '').trim();
      out.saveToVariable = (getVal('saveToVariable') || '').trim();
      var fr = (getVal('filterRunIf') || '').trim();
      if (fr) out.filterRunIf = fr;
      out.invertFilter = getChk('invertFilter');
      var offRaw = (getVal('offset') || '').trim();
      var limRaw = (getVal('limit') || '').trim();
      if (offRaw !== '') {
        var on = Number(offRaw);
        if (Number.isFinite(on) && on >= 0) out.offset = on;
      }
      if (limRaw !== '') {
        var ln = Number(limRaw);
        if (Number.isFinite(ln) && ln >= 0) out.limit = ln;
      }
      return out;
    },
  });
})();
