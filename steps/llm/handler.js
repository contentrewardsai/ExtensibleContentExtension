/**
 * LLM step: send prompt (with {{variable}} from row) to the configured backend (default: local LaMini in QC sandbox).
 * If Settings → LLM providers → Workflow default is a cloud provider with a saved API key, the service worker calls that API instead.
 * Get response by type (boolean, text, or textWithFeedback), save to row variable(s).
 * LaMini runs in the QC sandbox (Transformers.js); download via project folder or scripts/download-lamini-model.sh.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('llm', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (llm)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    function stepCommentFullText(comment) {
      const c = comment || {};
      if (typeof CFS_stepComment !== 'undefined' && CFS_stepComment.getStepCommentFullText) {
        return CFS_stepComment.getStepCommentFullText(c);
      }
      const parts = [];
      if (Array.isArray(c.items)) {
        for (let i = 0; i < c.items.length; i++) {
          const it = c.items[i];
          if (it && it.type === 'text' && it.text != null && String(it.text).trim()) parts.push(String(it.text).trim());
        }
      }
      if (parts.length) return parts.join('\n\n');
      return (c.text != null && String(c.text).trim()) ? String(c.text).trim() : '';
    }
    function resolveValue(val) {
      if (val == null || val === '') return val;
      const s = String(val).trim();
      if (s === '{{stepCommentText}}') return stepCommentFullText(action.comment);
      if (s === '{{stepCommentSummary}}') {
        const text = stepCommentFullText(action.comment);
        return text.length > 120 ? text.slice(0, 120) + '…' : text;
      }
      const m = s.match(/^\{\{(.+)\}\}$/);
      if (m) return getRowValue(row, m[1].trim());
      return s;
    }

    /** Replace {{var}} in template with row values. */
    function resolvePrompt(template) {
      if (!template || typeof template !== 'string') return '';
      return template.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
        const v = getRowValue(row, key.trim());
        return v != null ? String(v) : '';
      });
    }

    const prompt = resolvePrompt(action.prompt || '');
    const responseType = (action.responseType || 'text').toLowerCase();
    const saveAsVariable = (action.saveAsVariable || '').trim();
    const saveFeedbackVariable = (action.saveFeedbackVariable || '').trim();

    if (!prompt || !prompt.trim()) {
      const emptyResult = responseType === 'boolean' ? false : '';
      if (saveAsVariable && row && typeof row === 'object') row[saveAsVariable] = emptyResult;
      if (responseType === 'textWithFeedback' && saveFeedbackVariable && row && typeof row === 'object') row[saveFeedbackVariable] = '';
      return;
    }

    const msgPayload = { type: 'CALL_LLM', prompt, responseType };
    const lp = (action.llmProvider || '').trim().toLowerCase();
    if (lp === 'lamini' || lp === 'openai' || lp === 'claude' || lp === 'gemini' || lp === 'grok') {
      msgPayload.llmProvider = lp;
    }
    if (action.llmOpenaiModel != null && String(action.llmOpenaiModel).trim() !== '') {
      msgPayload.llmOpenaiModel = String(action.llmOpenaiModel).trim();
    }
    if (action.llmModelOverride != null && String(action.llmModelOverride).trim() !== '') {
      msgPayload.llmModelOverride = String(action.llmModelOverride).trim();
    }
    const CFS_LLM_STEP_MODEL_MAX_CHARS = 256;
    if (msgPayload.llmOpenaiModel && msgPayload.llmOpenaiModel.length > CFS_LLM_STEP_MODEL_MAX_CHARS) {
      throw new Error('OpenAI model id is too long (max ' + CFS_LLM_STEP_MODEL_MAX_CHARS + ' characters)');
    }
    if (msgPayload.llmModelOverride && msgPayload.llmModelOverride.length > CFS_LLM_STEP_MODEL_MAX_CHARS) {
      throw new Error('Model override is too long (max ' + CFS_LLM_STEP_MODEL_MAX_CHARS + ' characters)');
    }
    const response = await sendMessage(msgPayload);

    if (!response.ok) throw new Error(response.error || 'LLM call failed');

    if (saveAsVariable && row && typeof row === 'object') {
      row[saveAsVariable] = response.result;
    }
    if (responseType === 'textWithFeedback' && response.feedback != null && saveFeedbackVariable && row && typeof row === 'object') {
      row[saveFeedbackVariable] = response.feedback;
    }
  }, { needsElement: false });
})();
