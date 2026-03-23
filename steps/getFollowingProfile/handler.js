(function() {
  'use strict';
  window.__CFS_registerStepHandler('getFollowingProfile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const profileNameVar = (action.profileNameVariableKey || '').trim();
    const profileIdVar = (action.profileIdVariableKey || '').trim();
    const profileName = profileNameVar ? getRowValue(row, profileNameVar) : undefined;
    const profileId = profileIdVar ? getRowValue(row, profileIdVar) : undefined;

    if (!profileName && !profileId) {
      throw new Error('Get Following Profile: profileNameVariableKey or profileIdVariableKey required.');
    }

    const payload = { type: 'GET_FOLLOWING_DATA' };
    if (profileName) payload.profileName = String(profileName).trim();
    if (profileId) payload.profileId = String(profileId).trim();

    const response = await sendMessage(payload);

    if (!response || response.ok === false) {
      throw new Error('Get Following Profile failed: ' + ((response && response.error) || 'Request failed'));
    }

    const data = response.data != null ? response.data : (response.json && response.json.data != null ? response.json.data : response.json);
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = Array.isArray(data) ? (data[0] || null) : data;
    }
  }, { needsElement: false });
})();
