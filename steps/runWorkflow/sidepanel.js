(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('runWorkflow', {
    label: 'Run workflow',
    defaultAction: { type: 'runWorkflow', workflowId: '', rowMapping: {} },
    getSummary: function(action) {
      return 'Run: ' + (action.workflowId || '?');
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var workflowId = action.workflowId || '';
      var runIfVal = (action.runIf || '').trim();
      var rowMappingJson = typeof action.rowMapping === 'object'
        ? JSON.stringify(action.rowMapping, null, 2)
        : (action.rowMapping || '{}');
      var workflows = typeof window.__CFS_getWorkflowIds === 'function' ? window.__CFS_getWorkflowIds() : [];
      var options = workflows.map(function(id) {
        return '<option value="' + escapeHtml(id) + '"' + (id === workflowId ? ' selected' : '') + '>' + escapeHtml(id) + '</option>';
      }).join('');
      if (!options) options = '<option value="">— No workflows —</option>';
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{pageUrl}}"></div>' +
        '<div class="step-field"><label>Workflow</label><select data-field="workflowId" data-step="' + i + '">' + options + '</select></div>' +
        '<div class="step-field"><label>Row mapping (parent key → child key)</label><textarea data-field="rowMapping" data-step="' + i + '" rows="3" placeholder=\'{"url": "pageUrl"}\'>' + escapeHtml(rowMappingJson) + '</textarea><span class="step-hint">JSON: map current row keys to child workflow variable names.</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('runWorkflow', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'runWorkflow' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      out.workflowId = (getVal('workflowId') || '').trim() || action.workflowId || '';
      var mapVal = (getVal('rowMapping') || '').trim();
      if (mapVal) {
        try {
          out.rowMapping = JSON.parse(mapVal);
          if (typeof out.rowMapping !== 'object') out.rowMapping = {};
        } catch (_) {
          return { error: 'Invalid row mapping JSON' };
        }
      } else {
        out.rowMapping = action.rowMapping && typeof action.rowMapping === 'object' ? action.rowMapping : {};
      }
      return out;
    },
  });
})();
