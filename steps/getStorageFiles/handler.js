(function() {
  'use strict';
  window.__CFS_registerStepHandler('getStorageFiles', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getStorageFiles)');
    const { currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const getRowValue = ctx.getRowValue;
    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const msgPayload = { type: 'GET_STORAGE_FILES' };
    const pageVar = (action.pageVariableKey || '').trim();
    if (pageVar) { var p = getRowValue(row, pageVar); if (p != null) msgPayload.page = parseInt(p, 10) || 1; }
    const limitVar = (action.limitVariableKey || '').trim();
    if (limitVar) { var l = getRowValue(row, limitVar); if (l != null) msgPayload.limit = parseInt(l, 10) || 20; }

    const response = await sendMessage(msgPayload);
    if (!response || response.ok === false) {
      throw new Error('Get Storage Files failed: ' + ((response && response.error) || 'Request failed'));
    }
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.files || [];
    }
  }, { needsElement: false });
})();
