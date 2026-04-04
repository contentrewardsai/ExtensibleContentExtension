(function() {
  'use strict';
  window.__CFS_registerStepHandler('getFacebookPages', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getFacebookPages)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') throw new Error('Get Facebook Pages: API key required.');

    const profileVar = (action.profileVariableKey || '').trim();
    const profile = profileVar ? getRowValue(row, profileVar) : undefined;

    const response = await sendMessage({
      type: 'GET_FACEBOOK_PAGES',
      apiKey: String(apiKey).trim(),
      profile: profile ? String(profile).trim() : undefined,
    });

    if (!response || response.ok === false) {
      throw new Error('Get Facebook Pages failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json && response.json.pages ? response.json.pages : response.json;
    }
  }, { needsElement: false });
})();
