(function() {
  'use strict';
  window.__CFS_registerStepHandler('getShotstackRenders', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getShotstackRenders)');
    const { currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    const getRowValue = ctx.getRowValue;
    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const msgPayload = { type: 'GET_SHOTSTACK_RENDERS' };
    const limitVar = (action.limitVariableKey || '').trim();
    if (limitVar) { var l = getRowValue(row, limitVar); if (l != null) msgPayload.limit = parseInt(l, 10) || 20; }
    const envVar = (action.environmentVariableKey || '').trim();
    if (envVar) { var e = getRowValue(row, envVar); if (e) msgPayload.environment = String(e).trim(); }

    const response = await sendMessage(msgPayload);
    if (!response || response.ok === false) {
      /* Graceful fallback if endpoint not yet available */
      const saveVar = (action.saveAsVariable || '').trim();
      if (saveVar && row && typeof row === 'object') {
        row[saveVar] = [];
      }
      if (response && response.error && /not yet available|not found|404/i.test(response.error)) {
        return; /* silently return empty array */
      }
      throw new Error('Get ShotStack Renders failed: ' + ((response && response.error) || 'Request failed'));
    }
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.renders || [];
    }
  }, { needsElement: false });
})();
