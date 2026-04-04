(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  var defaultFieldMap = { exampleUrl: '{{base}}/{{slug}}' };

  window.__CFS_registerStepSidepanel('rowSetFields', {
    label: 'Set row fields (template)',
    defaultAction: {
      type: 'rowSetFields',
      runIf: '',
      rawCopies: [],
      fieldMap: defaultFieldMap,
    },
    getSummary: function(action) {
      var fm = action.fieldMap;
      var n = 0;
      if (fm && typeof fm === 'object' && !Array.isArray(fm)) n = Object.keys(fm).length;
      var rc = action.rawCopies;
      var m = Array.isArray(rc) ? rc.length : 0;
      var parts = [];
      if (m) parts.push(m + ' raw');
      if (n) parts.push(n + ' tmpl');
      return parts.length ? 'Set ' + parts.join(', ') : 'Set row fields';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var rawCopiesJson = Array.isArray(action.rawCopies)
        ? JSON.stringify(action.rawCopies, null, 2)
        : (typeof action.rawCopies === 'string' ? action.rawCopies : '[]');
      var fieldMapJson = typeof action.fieldMap === 'object' && action.fieldMap !== null
        ? JSON.stringify(action.fieldMap, null, 2)
        : (action.fieldMap || JSON.stringify(defaultFieldMap, null, 2));
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '" placeholder="{{enable}} or variable name"></div>' +
        '<div class="step-field"><label>Raw copies (JSON array, optional)</label><textarea data-field="rawCopies" data-step="' + i + '" rows="4" placeholder=\'[{"to":"data","fromPath":"api.body"}]\'>' + escapeHtml(rawCopiesJson) + '</textarea><span class="step-hint">Runs first: copy from row path to key without stringifying (uses getByLoosePath).</span></div>' +
        '<div class="step-field"><label>Field map (JSON: row key → template)</label><textarea data-field="fieldMap" data-step="' + i + '" rows="8" placeholder=\'{"url": "{{base}}/{{id}}"}\'>' + escapeHtml(fieldMapJson) + '</textarea><span class="step-hint">After raw copies: each value becomes a string via {{variables}}.</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('rowSetFields', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'rowSetFields' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      var rawRc = (getVal('rawCopies') || '').trim();
      try {
        out.rawCopies = rawRc ? JSON.parse(rawRc) : [];
      } catch (e) {
        out.rawCopies = Array.isArray(action.rawCopies) ? action.rawCopies : [];
      }
      if (!Array.isArray(out.rawCopies)) out.rawCopies = [];
      var raw = (getVal('fieldMap') || '').trim();
      try {
        out.fieldMap = raw ? JSON.parse(raw) : {};
      } catch (e) {
        out.fieldMap = action.fieldMap || {};
      }
      if (!out.fieldMap || typeof out.fieldMap !== 'object' || Array.isArray(out.fieldMap)) {
        out.fieldMap = {};
      }
      return out;
    },
  });
})();
