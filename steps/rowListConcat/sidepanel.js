(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('rowListConcat', {
    label: 'Concat row lists',
    defaultAction: {
      type: 'rowListConcat',
      runIf: '',
      listAVariable: 'listA',
      listBVariable: 'listB',
      saveToVariable: 'combined',
    },
    getSummary: function(action) {
      var a = (action.listAVariable || '').trim();
      var b = (action.listBVariable || '').trim();
      var o = (action.saveToVariable || '').trim();
      if (!a || !b) return 'Concat row lists';
      return a + ' + ' + b + ' → ' + (o || '?');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var av = (action.listAVariable || '').trim();
      var bv = (action.listBVariable || '').trim();
      var sv = (action.saveToVariable || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>First list (row variable)</label><input type="text" data-field="listAVariable" data-step="' + i + '" value="' + escapeHtml(av) + '"></div>' +
        '<div class="step-field"><label>Second list (row variable)</label><input type="text" data-field="listBVariable" data-step="' + i + '" value="' + escapeHtml(bv) + '"></div>' +
        '<div class="step-field"><label>Save combined list to</label><input type="text" data-field="saveToVariable" data-step="' + i + '" value="' + escapeHtml(sv) + '"></div>' +
        '<span class="step-hint">Order: all elements of A, then all elements of B (shallow copy via concat).</span>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('rowListConcat', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function getVal(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'rowListConcat' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.listAVariable = (getVal('listAVariable') || '').trim();
      out.listBVariable = (getVal('listBVariable') || '').trim();
      out.saveToVariable = (getVal('saveToVariable') || '').trim();
      return out;
    },
  });
})();
