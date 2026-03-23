(function() {
  'use strict';
  window.__CFS_registerStepHandler('deleteFollowingProfile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const profileIdVar = (action.profileIdVariableKey || '').trim();
    const profileNameVar = (action.profileNameVariableKey || '').trim();
    const profileId = profileIdVar ? getRowValue(row, profileIdVar) : undefined;
    const profileName = profileNameVar ? getRowValue(row, profileNameVar) : undefined;

    if (!profileId && !profileName) {
      throw new Error('Delete Following Profile: profileIdVariableKey or profileNameVariableKey required.');
    }

    const payload = {
      type: 'MUTATE_FOLLOWING',
      action: 'deleteProfile',
    };
    if (profileId) payload.profileId = String(profileId).trim();
    if (profileName) payload.profileName = String(profileName).trim();

    const response = await sendMessage(payload);

    if (!response || response.ok === false) {
      throw new Error('Delete Following Profile failed: ' + ((response && response.error) || 'Request failed'));
    }

    const data = response.data != null ? response.data : { deleted: true };
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = data;
    }
  }, { needsElement: false });
})();
