(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getConsoleLogs', {
    label: 'Get console logs',
    defaultAction: { type: 'getConsoleLogs', saveAsVariable: 'consoleLogs', levels: 'log,warn,error', maxEntries: 100, clear: true },
    getSummary: function(action) {
      var v = (action.saveAsVariable || 'consoleLogs').toString().trim();
      var levels = (action.levels || 'log,warn,error').toString().trim();
      return 'Console → ' + v + ' (' + levels + ')';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var saveAs = (action.saveAsVariable || '').toString().trim();
      var levels = (action.levels || 'log,warn,error').toString().trim();
      var maxEntries = action.maxEntries != null ? String(action.maxEntries) : '100';
      var clearChecked = action.clear !== false ? ' checked' : '';
      var body = '<div class="step-field"><label>Save as variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAs) + '" placeholder="consoleLogs"></div>' +
        '<div class="step-field"><label>Levels (comma-separated)</label><input type="text" data-field="levels" data-step="' + i + '" value="' + escapeHtml(levels) + '" placeholder="log,warn,error,info,debug"></div>' +
        '<div class="step-field"><label>Max entries</label><input type="number" data-field="maxEntries" data-step="' + i + '" value="' + escapeHtml(maxEntries) + '" min="1"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="clear" data-step="' + i + '"' + clearChecked + '> Clear buffer after reading</label></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('getConsoleLogs', action, i, totalCount, helpers, body);
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
      var saveAs = (getVal('saveAsVariable') || '').trim();
      if (!saveAs) return { error: 'saveAsVariable is required' };
      return {
        type: 'getConsoleLogs',
        saveAsVariable: saveAs,
        levels: (getVal('levels') || 'log,warn,error').trim(),
        maxEntries: parseInt(getVal('maxEntries') || '100', 10) || 100,
        clear: getChecked('clear'),
      };
    },
    getVariableKey: function(action) {
      var k = action && action.saveAsVariable != null ? String(action.saveAsVariable).trim() : '';
      return k || undefined;
    },
  });
})();
