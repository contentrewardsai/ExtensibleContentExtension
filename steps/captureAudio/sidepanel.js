(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('captureAudio', {
    label: 'Capture audio',
    defaultAction: {
      type: 'captureAudio',
      mode: 'element',
      durationMs: 10000,
      saveAsVariable: 'capturedAudio',
    },
    getSummary: function(action) {
      var mode = action.mode || 'element';
      var dur = action.durationMs || 10000;
      var v = action.saveAsVariable ? ' → ' + action.saveAsVariable : '';
      return 'Capture ' + mode + ' (' + (dur / 1000) + 's)' + v;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var mode = action.mode || 'element';
      var durationMs = action.durationMs != null ? action.durationMs : 10000;
      var selectorsRaw = Array.isArray(action.selectors)
        ? JSON.stringify(action.selectors, null, 2)
        : (typeof action.selectors === 'string' ? action.selectors : '');
      var saveVar = (action.saveAsVariable || '').trim();
      var body =
        '<div class="step-field"><label>Source</label><select data-field="mode" data-step="' + i + '" onchange="var b=this.closest(\'.step-body\'); if(b){ b.querySelectorAll(\'.step-capture-element\').forEach(function(el){ el.style.display=this.value===\'element\'?\'block\':\'none\'; }.bind(this)); }">' +
        '<option value="element"' + (mode === 'element' ? ' selected' : '') + '>Element (video/audio)</option>' +
        '<option value="tab"' + (mode === 'tab' ? ' selected' : '') + '>Tab audio</option>' +
        '<option value="display"' + (mode === 'display' ? ' selected' : '') + '>Display picker</option>' +
        '</select></div>' +
        '<div class="step-field step-capture-element" style="display:' + (mode === 'element' ? 'block' : 'none') + '"><label>Element selectors (JSON or CSS)</label><textarea data-field="selectors" data-step="' + i + '" rows="2" placeholder=\'["video","audio"] or .media-container\'>' + escapeHtml(selectorsRaw) + '</textarea>' +
        '<button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="selectors" title="Select on page">Select on page</button></div>' +
        '<div class="step-field"><label>Duration (ms)</label><input type="number" data-field="durationMs" data-step="' + i + '" value="' + durationMs + '" min="1000" max="60000" placeholder="10000"></div>' +
        '<div class="step-field"><label>Save to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveVar) + '" placeholder="capturedAudio"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('captureAudio', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'captureAudio' };
      out.mode = (getVal('mode') || 'element').trim();
      out.durationMs = Math.min(60000, Math.max(1000, parseInt(getVal('durationMs'), 10) || 10000));
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim() || 'capturedAudio';
      var selRaw = (getVal('selectors') || '').trim();
      if (selRaw) {
        try {
          out.selectors = selRaw.startsWith('[') ? JSON.parse(selRaw) : [selRaw];
          if (!Array.isArray(out.selectors)) out.selectors = [out.selectors];
        } catch (_) {
          out.selectors = [selRaw];
        }
      } else if (out.mode === 'element') {
        out.selectors = action.selectors || ['video', 'audio'];
      }
      return out;
    },
  });
})();
