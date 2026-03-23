/**
 * LLM step: send prompt (with {{variable}} from row) to local LaMini model (Xenova/LaMini-Flan-T5-783M).
 * Get response by type (boolean, text, or textWithFeedback), save to row variable(s).
 * Runs in QC sandbox with Transformers.js. Model must be downloaded (scripts/download-lamini-model.sh).
 * NOTE: Do not connect to external LLM/AI services. See docs/NOTES.md.
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

    const response = await sendMessage({ type: 'CALL_LLM', prompt, responseType });

    if (!response.ok) throw new Error(response.error || 'LLM call failed');

    if (saveAsVariable && row && typeof row === 'object') {
      row[saveAsVariable] = response.result;
    }
    if (responseType === 'textWithFeedback' && response.feedback != null && saveFeedbackVariable && row && typeof row === 'object') {
      row[saveFeedbackVariable] = response.feedback;
    }
  }, { needsElement: false });
})();
