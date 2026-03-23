(function() {
  'use strict';
  window.__CFS_registerStepHandler('getAnalytics', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getAnalytics)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const runIf = (action.runIf || '').trim();
    if (runIf) {
      const v = getRowValue(row, runIf);
      if (!v || String(v).trim() === '') return;
    }

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') throw new Error('Get Analytics: API key required.');

    const profileVar = (action.profileUsernameVariableKey || '').trim() || 'profileUsername';
    const profileUsername = getRowValue(row, profileVar, 'profileUsername', 'profile_username');
    if (!profileUsername) throw new Error('Get Analytics: profileUsername required.');

    const response = await sendMessage({
      type: 'GET_ANALYTICS',
      apiKey: String(apiKey).trim(),
      profileUsername: String(profileUsername).trim(),
    });

    if (!response || response.ok === false) {
      throw new Error('Get Analytics failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json || {};
    }
  }, { needsElement: false });
})();
