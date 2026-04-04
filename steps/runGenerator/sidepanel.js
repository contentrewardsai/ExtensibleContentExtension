(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  var DEFAULT_TEMPLATES = ['ad-apple-notes', 'ad-facebook', 'ad-twitter', 'blank-canvas'];

  function getTemplateIds() {
    return (window.__CFS_generatorTemplateIds && window.__CFS_generatorTemplateIds.length)
      ? window.__CFS_generatorTemplateIds
      : DEFAULT_TEMPLATES;
  }

  window.__CFS_registerStepSidepanel('runGenerator', {
    label: 'Run generator',
    defaultAction: {
      type: 'runGenerator',
      pluginId: 'ad-apple-notes',
      inputMap: {},
      saveAsVariable: 'generatedImage',
    },
    getSummary: function(action) {
      var pluginId = action.pluginId || 'generator';
      var varName = action.saveAsVariable ? ' → ' + action.saveAsVariable : '';
      return 'Run ' + pluginId + varName;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var templateIds = getTemplateIds();
      var pluginId = (action.pluginId || 'ad-apple-notes');
      var inputMapJson = typeof action.inputMap === 'object'
        ? JSON.stringify(action.inputMap, null, 2)
        : (action.inputMap || '{}');
      var saveAsVariable = action.saveAsVariable || 'generatedImage';

      var datalistId = 'cfs-gen-tpl-' + i + '-' + String(wfId || 'wf').replace(/[^a-zA-Z0-9_-]/g, '_');
      var datalistOpts = templateIds.map(function(p) {
        return '<option value="' + escapeHtml(p) + '"></option>';
      }).join('');

      var runIfVal = (action.runIf || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{prompt}} or variable name"></div>' +
        '<div class="step-field"><label>Generator (template id)</label><datalist id="' + datalistId + '">' + datalistOpts + '</datalist>' +
        '<input type="text" data-field="pluginId" data-step="' + i + '" list="' + datalistId + '" value="' + escapeHtml(pluginId) + '" placeholder="e.g. ad-facebook or {{templateId}}" style="width:100%;max-width:100%;">' +
        '<span class="step-hint">Pick a known template or enter a literal id / <code>{{rowVariable}}</code> resolved at run time.</span></div>' +
        '<div class="step-field"><label>Input mapping (generator input id → workflow variable or literal)</label><textarea data-field="inputMap" data-step="' + i + '" rows="4" placeholder=\'{"headline": "{{title}}", "body": "{{description}}"}\'>' + escapeHtml(inputMapJson) + '</textarea><span class="step-hint">JSON: keys = generator input ids from the template&apos;s inputSchema (embedded in template.json merge fields). Values: {{variable}}, {{stepCommentText}}, {{stepCommentSummary}}, {{currentWorkflow}}, or literal.</span>' + '</div>' +
        '<div class="step-field"><label>Save output to variable name</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAsVariable) + '" placeholder="generatedImage"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('runGenerator', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'runGenerator' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      out.pluginId = (getVal('pluginId') || 'ad-apple-notes').trim();
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim() || 'generatedImage';
      var inputMapVal = (getVal('inputMap') || '').trim();
      if (inputMapVal) {
        try {
          out.inputMap = JSON.parse(inputMapVal);
          if (typeof out.inputMap !== 'object') out.inputMap = {};
        } catch (_) {
          return { error: 'Invalid input map JSON' };
        }
      } else {
        out.inputMap = action.inputMap || {};
      }
      return out;
    },
  });
})();
