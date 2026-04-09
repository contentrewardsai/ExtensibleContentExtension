/**
 * Run generator step: send inputs to the template engine (via offscreen runner).
 * templateId (pluginId) selects a template (bare id = bundled; project:id = uploads templates);
 * runner loads template + extension using selectedProjectId from storage for project templates.
 * Receives image/video/audio/text/book; saves to workflow variable.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('runGenerator', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (runGenerator)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const pluginIdRaw = action.pluginId;
    if (!pluginIdRaw) throw new Error('runGenerator: pluginId required');
    const pluginIdStr = String(pluginIdRaw).trim();
    const pluginIdMatch = pluginIdStr.match(/^\{\{(.+)\}\}$/);
    const pluginId = pluginIdMatch
      ? String(getRowValue(row, pluginIdMatch[1].trim()) || '').trim()
      : pluginIdStr;
    if (!pluginId) throw new Error('runGenerator: template id (pluginId) is empty after resolving row variable');

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
      if (s === '{{currentWorkflow}}' && ctx.currentWorkflow) {
        try { return typeof ctx.currentWorkflow === 'object' ? JSON.stringify(ctx.currentWorkflow) : String(ctx.currentWorkflow); } catch (_) { return ''; }
      }
      const m = s.match(/^\{\{(.+)\}\}$/);
      if (m) return getRowValue(row, m[1].trim());
      return s;
    }

    const inputMap = action.inputMap && typeof action.inputMap === 'object'
      ? action.inputMap
      : (typeof action.inputMap === 'string' ? (function() {
          try { return JSON.parse(action.inputMap || '{}'); } catch (_) { return {}; }
        }()) : {});

    const inputs = {};
    for (const key in inputMap) {
      inputs[key] = resolveValue(inputMap[key]);
    }
    const rowIndex = ctx.currentRowIndex != null ? Number(ctx.currentRowIndex) : (row._rowIndex != null ? Number(row._rowIndex) : 0);
    inputs._cfsRowIndex = rowIndex;
    inputs._cfsRow = row;

    const response = await sendMessage({ type: 'RUN_GENERATOR', pluginId, inputs, entry: action.entry });

    if (!response.ok) throw new Error(response.error || 'Generator failed');

    const varName = action.saveAsVariable;
    if (varName && row && typeof row === 'object') {
      if (response.type === 'image' || response.type === 'video' || response.type === 'audio' || response.type === 'book') {
        row[varName] = response.data;
      } else if (response.type === 'text') {
        row[varName] = response.data;
      } else {
        row[varName] = response.data;
      }
    }
  });
})();
