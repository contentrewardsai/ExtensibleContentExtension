(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('openTab', {
    label: 'Open tab / window',
    defaultAction: { type: 'openTab', url: '', andSwitchToTab: false, openInNewWindow: false },
    getSummary: function(action) {
      var u = (action.url || '').toString().trim();
      var from = (action.variableKey || '').toString().trim();
      var part = u ? u.slice(0, 35) + (u.length > 35 ? '…' : '') : (from ? 'from row: ' + from : 'Open tab');
      if (action.andSwitchToTab) part += ' (then run next steps there)';
      if (action.openInNewWindow) part += ' [new window]';
      return part;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var url = (action.url || '').toString().trim();
      var variableKey = (action.variableKey || '').toString().trim();
      var andSwitch = !!action.andSwitchToTab;
      var newWindow = !!action.openInNewWindow;
      var body = '<div class="step-field"><label>URL</label><input type="text" data-field="url" data-step="' + i + '" value="' + escapeHtml(url) + '" placeholder="https://example.com or leave empty to use row value"></div>' +
        '<div class="step-field"><label>Row variable (if URL empty)</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '" placeholder="e.g. url"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="andSwitchToTab" data-step="' + i + '"' + (andSwitch ? ' checked' : '') + '> Use this tab for next steps</label><span class="hint">Run remaining steps in the new tab instead of the current one.</span></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="openInNewWindow" data-step="' + i + '"' + (newWindow ? ' checked' : '') + '> Open in new window</label></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('openTab', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var getChecked = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.checked : false;
      };
      var out = { type: 'openTab' };
      var url = (getVal('url') || '').trim();
      var variableKey = (getVal('variableKey') || '').trim();
      if (url) out.url = url;
      if (variableKey) out.variableKey = variableKey;
      out.andSwitchToTab = getChecked('andSwitchToTab');
      out.openInNewWindow = getChecked('openInNewWindow');
      return out;
    },
  });
})();
