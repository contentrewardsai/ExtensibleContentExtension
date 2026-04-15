(function() {
  'use strict';
  window.__CFS_registerStepHandler('getAccountStatus', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getAccountStatus)');
    const { currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const getRowValue = ctx.getRowValue;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const response = await sendMessage({ type: 'GET_ACCOUNT_STATUS' });

    if (!response || response.ok === false) {
      throw new Error('Get Account Status failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.status || response;
    }
  }, { needsElement: false });
})();
