(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  var RESPONSE_TYPES = [
    { value: 'boolean', label: 'True / False' },
    { value: 'text', label: 'Text (no feedback)' },
    { value: 'textWithFeedback', label: 'Text with feedback (response + reasoning)' },
  ];

  window.__CFS_registerStepSidepanel('llm', {
    label: 'Call LLM',
    defaultAction: {
      type: 'llm',
      prompt: 'Based on the following, answer the question.\n\nContent:\n{{content}}\n\nQuestion: Is this appropriate for our audience?',
      responseType: 'boolean',
      saveAsVariable: 'llmResult',
      saveFeedbackVariable: '',
    },
    getSummary: function(action) {
      var type = action.responseType || 'text';
      var out = action.saveAsVariable ? ' → ' + action.saveAsVariable : '';
      var prov = (action.llmProvider || '').trim().toLowerCase();
      var provTag = prov ? ' [' + prov + ']' : '';
      return 'LLM (' + type + ')' + provTag + out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var prompt = (action.prompt || '').trim();
      var responseType = action.responseType || 'text';
      var saveAs = (action.saveAsVariable || 'llmResult').trim();
      var saveFeedback = (action.saveFeedbackVariable || '').trim();

      var optionsHtml = RESPONSE_TYPES.map(function(opt) {
        return '<option value="' + escapeHtml(opt.value) + '"' + (opt.value === responseType ? ' selected' : '') + '>' + escapeHtml(opt.label) + '</option>';
      }).join('');

      var runIfVal = (action.runIf || '').trim();
      var llmProv = (action.llmProvider || '').trim();
      var llmOpenaiModel = (action.llmOpenaiModel || '').trim();
      var llmModelOverride = (action.llmModelOverride || '').trim();
      var stepModelVal = '';
      if (llmProv === 'openai' && llmOpenaiModel) stepModelVal = llmOpenaiModel;
      else if ((llmProv === 'claude' || llmProv === 'gemini' || llmProv === 'grok') && llmModelOverride) stepModelVal = llmModelOverride;
      var showStepModel = llmProv === 'openai' || llmProv === 'claude' || llmProv === 'gemini' || llmProv === 'grok';
      var provOptions = [
        { value: '', label: 'Use Settings default' },
        { value: 'lamini', label: 'LaMini (local)' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'claude', label: 'Claude (Anthropic)' },
        { value: 'gemini', label: 'Gemini' },
        { value: 'grok', label: 'Grok (xAI)' },
      ];
      var provOptsHtml = provOptions.map(function(po) {
        return '<option value="' + escapeHtml(po.value) + '"' + (po.value === llmProv ? ' selected' : '') + '>' + escapeHtml(po.label) + '</option>';
      }).join('');
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{prompt}} or variable name"></div>' +
        '<div class="step-field"><label>Backend (optional)</label><select data-field="llmProvider" data-step="' + i + '">' + provOptsHtml + '</select><span class="step-hint">Overrides Settings → Workflow default for this step only.</span></div>' +
        '<div class="step-field cfs-llm-step-model-row" data-step="' + i + '" style="display:' + (showStepModel ? '' : 'none') + '"><label>Model (optional)</label><input type="text" data-field="llmStepModel" data-step="' + i + '" maxlength="256" value="' + escapeHtml(stepModelVal) + '" placeholder="OpenAI: gpt-4o-mini · Claude/Gemini/Grok: leave empty for default"><span class="step-hint">Only when this step uses a cloud backend above.</span></div>' +
        '<div class="step-field"><label>Prompt (use {{variableName}} for row variables)</label><textarea data-field="prompt" data-step="' + i + '" rows="5" placeholder="e.g. Is this text suitable for kids? Reply true or false.\n\nText:\n{{content}}">' + escapeHtml(prompt) + '</textarea><span class="step-hint">Uses Settings workflow default or the backend chosen above. Variables as {{name}}.</span></div>' +
        '<div class="step-field"><label>Response type</label><select data-field="responseType" data-step="' + i + '">' + optionsHtml + '</select></div>' +
        '<div class="step-field"><label>Save result to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAs) + '" placeholder="llmResult"></div>' +
        '<div class="step-field step-field-llm-feedback" data-response-type="textWithFeedback"><label>Save feedback/reasoning to variable (optional)</label><input type="text" data-field="saveFeedbackVariable" data-step="' + i + '" value="' + escapeHtml(saveFeedback) + '" placeholder="llmFeedback"><span class="step-hint">Only used when response type is "Text with feedback".</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      var shell = window.__CFS_buildStepItemShell('llm', action, i, totalCount, helpers, body);
      return shell;
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'llm' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      var backend = (getVal('llmProvider') || '').trim();
      if (backend) out.llmProvider = backend;
      var stepModel = (getVal('llmStepModel') || '').trim();
      if (backend === 'openai' && stepModel) out.llmOpenaiModel = stepModel;
      else if ((backend === 'claude' || backend === 'gemini' || backend === 'grok') && stepModel) out.llmModelOverride = stepModel;
      out.prompt = (getVal('prompt') || '').trim() || (action.prompt || '');
      out.responseType = (getVal('responseType') || 'text').trim() || 'text';
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim() || 'llmResult';
      var feedbackVar = (getVal('saveFeedbackVariable') || '').trim();
      if (feedbackVar) out.saveFeedbackVariable = feedbackVar;
      return out;
    },
  });
})();
