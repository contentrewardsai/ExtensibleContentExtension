(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('extractData', {
    label: 'Extract data',
    defaultAction: { type: 'extractData', listSelector: '', itemSelector: 'li, [data-index], tr', fields: [{ key: 'name', selectors: [] }, { key: 'email', selectors: [] }], maxItems: 0 },
    getSummary: function(action) {
      var f = (action.fields || []).length;
      return 'Extract data (' + f + ' field' + (f !== 1 ? 's' : '') + ') → table';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var listSelector = typeof action.listSelector === 'string' ? action.listSelector : '';
      var itemSelector = action.itemSelector || 'li, [data-index], tr';
      var fieldsJson = JSON.stringify(action.fields || [{ key: 'name', selectors: [] }, { key: 'email', selectors: [] }], null, 2);
      var maxItems = action.maxItems || 0;
      var body = '<div class="step-field"><label>List container selector</label><input type="text" data-field="listSelector" data-step="' + i + '" value="' + escapeHtml(listSelector) + '" placeholder="e.g. table tbody, ul">' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="listSelector" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Item selector (within list)</label><input type="text" data-field="itemSelector" data-step="' + i + '" value="' + escapeHtml(itemSelector) + '" placeholder="li, tr, [data-index]"></div>' +
        '<div class="step-field"><label>Fields to extract (JSON array)</label><textarea data-field="fields" data-step="' + i + '" rows="4">' + escapeHtml(fieldsJson) + '</textarea></div>' +
        '<div class="step-field"><label>Max items (0 = no limit)</label><input type="number" data-field="maxItems" data-step="' + i + '" value="' + maxItems + '" min="0" placeholder="0"></div>' +
        '<div class="step-field"><button type="button" class="btn btn-outline step-test-extract" data-step-index="' + i + '" title="Run extraction on the current page">Test extraction</button></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('extractData', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'extractData' };
      var d = getVal('delay');
      out.delay = d ? parseInt(d, 10) : undefined;
      out.waitAfter = getVal('waitAfter') || 'time';
      var listVal = (getVal('listSelector') || '').trim();
      out.listSelector = listVal || undefined;
      var itemVal = (getVal('itemSelector') || '').trim();
      out.itemSelector = itemVal || 'li, [data-index], tr';
      var fieldsVal = (getVal('fields') || '').trim();
      if (fieldsVal) {
        try {
          out.fields = JSON.parse(fieldsVal);
          if (!Array.isArray(out.fields)) out.fields = [];
        } catch (_) {
          return { error: 'Invalid fields JSON' };
        }
      } else {
        out.fields = action.fields || [];
      }
      var maxVal = getVal('maxItems');
      out.maxItems = (maxVal !== undefined && maxVal !== '') ? Math.max(0, parseInt(maxVal, 10) || 0) : 0;
      return out;
    },
  });
})();
