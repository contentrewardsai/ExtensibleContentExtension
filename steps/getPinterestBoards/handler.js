(function() {
  'use strict';
  window.__CFS_registerStepHandler('getPinterestBoards', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getPinterestBoards)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const runIf = (action.runIf || '').trim();
    if (runIf) {
      const v = getRowValue(row, runIf);
      if (!v || String(v).trim() === '') return;
    }

    const apiKeyVar = (action.apiKeyVariableKey || '').trim() || 'uploadPostApiKey';
    const apiKey = getRowValue(row, apiKeyVar, 'apiKey', 'uploadPostApiKey');
    if (!apiKey || String(apiKey).trim() === '') throw new Error('Get Pinterest Boards: API key required.');

    const profileVar = (action.profileVariableKey || '').trim();
    const profile = profileVar ? getRowValue(row, profileVar) : undefined;

    const response = await sendMessage({
      type: 'GET_PINTEREST_BOARDS',
      apiKey: String(apiKey).trim(),
      profile: profile ? String(profile).trim() : undefined,
    });

    if (!response || response.ok === false) {
      throw new Error('Get Pinterest Boards failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = response.json && response.json.boards ? response.json.boards : response.json;
    }
  }, { needsElement: false });
})();
