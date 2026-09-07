(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  function stepsPreview(steps, escapeHtml) {
    if (!Array.isArray(steps) || !steps.length) return '<em class="hint">empty</em>';
    return steps.map(function(s, i) {
      var t = (s && s.type) || '?';
      var extra = '';
      if (s && s.workflowId) extra = ' → ' + s.workflowId;
      else if (s && s.runIf) extra = ' if ' + String(s.runIf).slice(0, 24);
      return '<div class="if-arm-step">' + (i + 1) + '. ' + escapeHtml(t) + escapeHtml(extra) + '</div>';
    }).join('');
  }

  window.__CFS_registerStepSidepanel('ifCondition', {
    label: 'If / else',
    defaultAction: { type: 'ifCondition', condition: '', thenSteps: [], elseSteps: [] },
    getSummary: function(action) {
      var c = String(action.condition || '').trim();
      var th = Array.isArray(action.thenSteps) ? action.thenSteps.length : 0;
      var el = Array.isArray(action.elseSteps) ? action.elseSteps.length : 0;
      return (c ? 'If ' + c.slice(0, 36) : 'If / else') + ' (then ' + th + ' / else ' + el + ')';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var cond = String(action.condition || '');
      var thenJson = JSON.stringify(Array.isArray(action.thenSteps) ? action.thenSteps : [], null, 2);
      var elseJson = JSON.stringify(Array.isArray(action.elseSteps) ? action.elseSteps : [], null, 2);
      var body =
        '<div class="step-field"><label>Condition</label><input type="text" data-field="condition" data-step="' + i + '" data-testid="cfs-step-if-condition" value="' + escapeHtml(cond) + '" placeholder="e.g. {{loggedIn}} === true"></div>' +
        '<div class="step-field"><label>Then</label><div class="if-arm-preview">' + stepsPreview(action.thenSteps, escapeHtml) + '</div>' +
        '<textarea data-field="thenSteps" data-step="' + i + '" rows="4">' + escapeHtml(thenJson) + '</textarea></div>' +
        '<div class="step-field"><label>Else</label><div class="if-arm-preview">' + stepsPreview(action.elseSteps, escapeHtml) + '</div>' +
        '<textarea data-field="elseSteps" data-step="' + i + '" rows="4">' + escapeHtml(elseJson) + '</textarea></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('ifCondition', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var parseArm = function(raw, fallback) {
        try {
          var v = JSON.parse(raw || '[]');
          return Array.isArray(v) ? v : (Array.isArray(fallback) ? fallback : []);
        } catch (_) {
          return { error: 'Invalid JSON array' };
        }
      };
      var thenSteps = parseArm(getVal('thenSteps'), action.thenSteps);
      if (thenSteps && thenSteps.error) return thenSteps;
      var elseSteps = parseArm(getVal('elseSteps'), action.elseSteps);
      if (elseSteps && elseSteps.error) return elseSteps;
      return {
        type: 'ifCondition',
        condition: String(getVal('condition') || '').trim(),
        thenSteps: thenSteps,
        elseSteps: elseSteps,
      };
    },
  });
})();
