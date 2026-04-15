(function() {
  'use strict';
  window.__CFS_registerStepHandler('getLinkedInPages', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getLinkedInPages)');
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

    const profileVar = (action.profileVariableKey || '').trim();
    const profile = profileVar ? getRowValue(row, profileVar) : undefined;

    const response = await sendMessage({
      type: 'GET_LINKEDIN_PAGES',
      ...(viaBackend ? { viaBackend: true } : { apiKey: String(apiKey).trim() }),
      profile: profile ? String(profile).trim() : undefined,
    });

    if (!response || response.ok === false) {
      throw new Error('Get LinkedIn Pages failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json && response.json.pages ? response.json.pages : response.json;
    }
  }, { needsElement: false });
})();
