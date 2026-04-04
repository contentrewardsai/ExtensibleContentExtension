(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('rowListDedupe', {
    label: 'Dedupe row list',
    defaultAction: {
      type: 'rowListDedupe',
      runIf: '',
      sourceVariable: 'items',
      saveToVariable: 'items',
      dedupeKey: 'id',
      keepFirst: false,
    },
    getSummary: function(action) {
      var s = (action.sourceVariable || '').trim() || '?';
      var o = (action.saveToVariable || '').trim() || '?';
      var k = (action.dedupeKey || '').trim() || '?';
      var mode = action.keepFirst ? 'first' : 'last';
      return 'dedupe ' + s + ' by ' + k + ' (' + mode + ') → ' + o;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var src = (action.sourceVariable || '').trim();
      var out = (action.saveToVariable || '').trim();
      var dk = (action.dedupeKey || '').trim();
      var kf = !!action.keepFirst;
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Source list (row variable)</label><input type="text" data-field="sourceVariable" data-step="' + i + '" value="' + escapeHtml(src) + '"></div>' +
        '<div class="step-field"><label>Save deduped list to</label><input type="text" data-field="saveToVariable" data-step="' + i + '" value="' + escapeHtml(out) + '"></div>' +
        '<div class="step-field"><label>Dedupe key (path on each object)</label><input type="text" data-field="dedupeKey" data-step="' + i + '" value="' + escapeHtml(dk) + '" placeholder="id"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="keepFirst" data-step="' + i + '"' + (kf ? ' checked' : '') + '> Keep <strong>first</strong> occurrence (default: keep <strong>last</strong>)</label></div>' +
        '<span class="step-hint">Rows without the key are all kept. Elements must be plain objects.</span>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('rowListDedupe', action, i, totalCount, helpers, body);
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
      var out = { type: 'rowListDedupe' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.sourceVariable = (getVal('sourceVariable') || '').trim();
      out.saveToVariable = (getVal('saveToVariable') || '').trim();
      out.dedupeKey = (getVal('dedupeKey') || '').trim();
      out.keepFirst = getChk('keepFirst');
      return out;
    },
  });
})();
