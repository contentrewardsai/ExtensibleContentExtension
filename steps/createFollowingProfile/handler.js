(function() {
  'use strict';
  window.__CFS_registerStepHandler('createFollowingProfile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const nameVar = (action.nameVariableKey || '').trim();
    if (!nameVar) throw new Error('Create Following Profile: nameVariableKey is required');

    const nameValue = getRowValue(row, nameVar);
    if (nameValue == null || String(nameValue).trim() === '') {
      throw new Error('Create Following Profile: name variable value is empty');
    }

    const birthdayVar = (action.birthdayVariableKey || '').trim();
    const birthdayValue = birthdayVar ? getRowValue(row, birthdayVar) : undefined;
    const birthday = birthdayValue != null ? String(birthdayValue).trim() : '';

    const payload = {
      type: 'MUTATE_FOLLOWING',
      action: 'createProfile',
      name: String(nameValue).trim(),
      birthday: birthday || undefined
    };

    const response = await sendMessage(payload);

    if (!response || response.ok === false) {
      throw new Error('Create Following Profile failed: ' + ((response && response.error) || 'Request failed'));
    }

    const data = response.data != null ? response.data : (response.json && response.json.data != null ? response.json.data : response.json);
    const profileId = data && data.profileId;
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = profileId != null ? profileId : data;
    }
  }, { needsElement: false });
})();
