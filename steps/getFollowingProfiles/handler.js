(function() {
  'use strict';
  window.__CFS_registerStepHandler('getFollowingProfiles', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const nameFilterVar = (action.nameFilterVariableKey || '').trim();
    const nameFilter = nameFilterVar ? getRowValue(row, nameFilterVar) : undefined;

    const response = await sendMessage({
      type: 'GET_FOLLOWING_DATA',
      nameFilter: nameFilter != null && nameFilter !== '' ? String(nameFilter).trim() : undefined,
    });

    if (!response || response.ok === false) {
      throw new Error('Get Following Profiles failed: ' + ((response && response.error) || 'Request failed'));
    }

    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      const data = (response.data !== undefined) ? response.data : (response.json && response.json.data) ? response.json.data : [];
      row[saveVar] = Array.isArray(data) ? data : [];
    }
  }, { needsElement: false });
})();
