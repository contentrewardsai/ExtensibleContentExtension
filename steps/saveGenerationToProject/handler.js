/**
 * Save generation to project: queue the variable's content (image/video/text data URL or blob URL)
 * for saving under uploads/{projectId}/generations/ (default folder) with numeric naming.
 * The sidepanel writes files when the user has set the project folder and clicks Save pending generations.
 */
(function() {
  'use strict';
  window.__CFS_registerStepHandler('saveGenerationToProject', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (saveGenerationToProject)');
    const { getRowValue, currentRow, actionIndex, sendMessage } = ctx;
    const row = currentRow || {};

    function resolve(val) {
      if (val == null || val === '') return '';
      const s = String(val).trim();
      const m = s.match(/^\{\{(.+)\}\}$/);
      if (m) return getRowValue(row, m[1].trim()) || '';
      return s;
    }

    const varName = action.variableName || 'generatedImage';
    const data = getRowValue(row, varName);
    if (!data || typeof data !== 'string') return;

    let projectId = resolve(action.projectIdVariable || '');
    if (!projectId && typeof CFS_projectIdResolve !== 'undefined') {
      const r = await CFS_projectIdResolve.resolveProjectIdAsync(row, {
        defaultProjectId: action.defaultProjectId,
      });
      if (r.ok) projectId = r.projectId;
    }
    const folder = action.folder || 'generations';
    const rowIndex = (ctx.currentRowIndex != null ? ctx.currentRowIndex : (row._rowIndex != null ? row._rowIndex : 0));
    const namingFormat = (action.namingFormat || 'numeric').toLowerCase();

    await sendMessage({
      type: 'QUEUE_SAVE_GENERATION',
      payload: {
        projectId: projectId || null,
        folder,
        data,
        rowIndex,
        variableName: varName,
        namingFormat: namingFormat === 'row' ? 'row' : 'numeric',
      },
    });
  });
})();
