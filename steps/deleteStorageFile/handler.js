(function() {
  'use strict';
  window.__CFS_registerStepHandler('deleteStorageFile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (deleteStorageFile)');
    const { currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const getRowValue = ctx.getRowValue;
    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const fileIdVar = (action.fileIdVariableKey || '').trim() || 'fileId';
    const fileId = getRowValue(row, fileIdVar, 'fileId', 'file_id');
    if (!fileId || String(fileId).trim() === '') throw new Error('Delete Storage File: fileId required.');

    const response = await sendMessage({ type: 'DELETE_STORAGE_FILE', fileId: String(fileId).trim() });
    if (!response || response.ok === false) {
      throw new Error('Delete Storage File failed: ' + ((response && response.error) || 'Request failed'));
    }
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = { ok: true, deleted: true };
    }
  }, { needsElement: false });
})();
