(function() {
  'use strict';
  window.__CFS_registerStepHandler('getPostAnalytics', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getPostAnalytics)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const runIf = (action.runIf || '').trim();
    if (runIf) {
      const v = getRowValue(row, runIf);
      if (!v || String(v).trim() === '') return;
    }

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') throw new Error('Get Post Analytics: API key required.');

    const requestIdVar = (action.requestIdVariableKey || '').trim();
    const requestId = requestIdVar ? getRowValue(row, requestIdVar, 'requestId', 'request_id') : undefined;

    const profileVar = (action.profileUsernameVariableKey || '').trim() || 'profileUsername';
    const profileUsername = getRowValue(row, profileVar, 'profileUsername', 'profile_username');

    if (!requestId && !profileUsername) throw new Error('Get Post Analytics: profileUsername or requestId required.');

    const msgPayload = {
      type: 'GET_POST_ANALYTICS',
      apiKey: String(apiKey).trim(),
    };

    if (requestId) {
      msgPayload.requestId = String(requestId).trim();
    } else {
      msgPayload.profileUsername = String(profileUsername).trim();
      const startVar = (action.startDateVariableKey || '').trim();
      if (startVar) {
        const sd = getRowValue(row, startVar);
        if (sd) msgPayload.startDate = String(sd).trim();
      }
      const endVar = (action.endDateVariableKey || '').trim();
      if (endVar) {
        const ed = getRowValue(row, endVar);
        if (ed) msgPayload.endDate = String(ed).trim();
      }
    }

    const response = await sendMessage(msgPayload);

    if (!response || response.ok === false) {
      throw new Error('Get Post Analytics failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json || {};
    }
  }, { needsElement: false });
})();
