(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('clipboardWrite', {
    label: 'Clipboard write',
    defaultAction: { type: 'clipboardWrite', text: '' },
    getSummary: function(action) {
      var t = (action.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return t ? ('Write: ' + t) : 'Clipboard write';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var body = '<div class="step-field"><label>Text</label><span class="step-hint">Use {{columnName}} for row substitution.</span>' +
        '<textarea data-field="text" data-step="' + i + '" rows="4">' + escapeHtml(action.text || '') + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('clipboardWrite', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var el = item.querySelector('[data-field="text"][data-step="' + idx + '"]');
      return { type: 'clipboardWrite', text: el ? el.value : (action.text || '') };
    },
  });
})();
