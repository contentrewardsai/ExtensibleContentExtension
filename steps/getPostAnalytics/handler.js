(function() {
  'use strict';
  window.__CFS_registerStepHandler('getPostAnalytics', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getPostAnalytics)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    var apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    var viaBackend = false;
    if (!apiKey || String(apiKey).trim() === '') {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try { var ld = await chrome.storage.local.get('uploadPostApiKey'); if (ld.uploadPostApiKey && String(ld.uploadPostApiKey).trim()) apiKey = String(ld.uploadPostApiKey).trim(); } catch (_) {}
      }
      if (!apiKey || String(apiKey).trim() === '') viaBackend = true;
    }

    const requestIdVar = (action.requestIdVariableKey || '').trim();
    const requestId = requestIdVar ? getRowValue(row, requestIdVar, 'requestId', 'request_id') : undefined;

    const profileVar = (action.profileUsernameVariableKey || '').trim() || 'profileUsername';
    const profileUsername = getRowValue(row, profileVar, 'profileUsername', 'profile_username');

    if (!requestId && !profileUsername) throw new Error('Get Post Analytics: profileUsername or requestId required.');

    const msgPayload = {
      type: 'GET_POST_ANALYTICS',
      ...(viaBackend ? { viaBackend: true } : { apiKey: String(apiKey).trim() }),
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
