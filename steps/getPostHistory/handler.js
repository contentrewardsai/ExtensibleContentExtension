(function() {
  'use strict';
  window.__CFS_registerStepHandler('getPostHistory', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getPostHistory)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const runIf = (action.runIf || '').trim();
    if (runIf) {
      const v = getRowValue(row, runIf);
      if (!v || String(v).trim() === '') return;
    }

    const userVar = (action.userVariableKey || '').trim();
    const platformVar = (action.platformVariableKey || '').trim();
    const limitVar = (action.limitVariableKey || '').trim();

    const user = userVar ? getRowValue(row, userVar) : undefined;
    const platform = platformVar ? getRowValue(row, platformVar) : undefined;
    const limitRaw = limitVar ? getRowValue(row, limitVar) : undefined;
    const limit = limitRaw != null ? Math.max(0, parseInt(limitRaw, 10) || 0) : undefined;

    const msgPayload = {
      type: 'GET_POST_HISTORY',
    };
    if (user != null && String(user).trim() !== '') msgPayload.user = String(user).trim();
    if (platform != null && String(platform).trim() !== '') msgPayload.platform = String(platform).trim();
    if (limit != null && limit > 0) msgPayload.limit = limit;

    const response = await sendMessage(msgPayload);

    if (!response || response.ok === false) {
      throw new Error('Get Post History failed: ' + ((response && response.error) || 'Request failed'));
    }

    const posts = Array.isArray(response.posts) ? response.posts : (Array.isArray(response.json) ? response.json : []);
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = posts;
    }
  }, { needsElement: false });
})();
