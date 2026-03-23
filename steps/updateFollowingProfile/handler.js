(function() {
  'use strict';
  window.__CFS_registerStepHandler('updateFollowingProfile', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const profileIdVar = (action.profileIdVariableKey || '').trim();
    const profileNameVar = (action.profileNameVariableKey || '').trim();
    const profileId = profileIdVar ? getRowValue(row, profileIdVar) : undefined;
    const profileName = profileNameVar ? getRowValue(row, profileNameVar) : undefined;

    if (!profileId && !profileName) {
      throw new Error('Update Following Profile: profileIdVariableKey or profileNameVariableKey required.');
    }

    const payload = {
      type: 'MUTATE_FOLLOWING',
      action: 'updateProfile',
    };
    if (profileId) payload.profileId = String(profileId).trim();
    if (profileName) payload.profileName = String(profileName).trim();

    const nameVar = (action.nameVariableKey || '').trim();
    const birthdayVar = (action.birthdayVariableKey || '').trim();
    const nameVal = nameVar ? getRowValue(row, nameVar) : undefined;
    const birthdayVal = birthdayVar ? getRowValue(row, birthdayVar) : undefined;
    if (nameVal != null && nameVal !== '') payload.name = String(nameVal).trim();
    if (birthdayVal != null && birthdayVal !== '') payload.birthday = String(birthdayVal).trim();

    const handleVar = (action.addAccountHandleVariableKey || '').trim();
    const platformVar = (action.addAccountPlatformVariableKey || '').trim();
    const urlVar = (action.addAccountUrlVariableKey || '').trim();
    const handleVal = handleVar ? getRowValue(row, handleVar) : undefined;
    const platformVal = platformVar ? getRowValue(row, platformVar) : undefined;
    const urlVal = urlVar ? getRowValue(row, urlVar) : undefined;
    const handle = (handleVal != null ? String(handleVal).trim() : '');
    const platform = (platformVal != null ? String(platformVal).trim() : '');
    const url = (urlVal != null ? String(urlVal).trim() : '');
    if (handle || platform || url) {
      payload.addAccount = { handle: handle || '', platform: platform || '', url: url || '' };
    }

    const addPhoneVar = (action.addPhoneVariableKey || '').trim();
    const addEmailVar = (action.addEmailVariableKey || '').trim();
    const addAddressVar = (action.addAddressVariableKey || '').trim();
    const addNoteVar = (action.addNoteVariableKey || '').trim();
    const addPhoneVal = addPhoneVar ? getRowValue(row, addPhoneVar) : undefined;
    const addEmailVal = addEmailVar ? getRowValue(row, addEmailVar) : undefined;
    const addAddressVal = addAddressVar ? getRowValue(row, addAddressVar) : undefined;
    const addNoteVal = addNoteVar ? getRowValue(row, addNoteVar) : undefined;
    if (addPhoneVal != null && addPhoneVal !== '') payload.addPhone = String(addPhoneVal).trim();
    if (addEmailVal != null && addEmailVal !== '') payload.addEmail = String(addEmailVal).trim();
    if (addNoteVal != null && addNoteVal !== '') payload.addNote = String(addNoteVal).trim();
    if (addAddressVal != null && addAddressVal !== '') {
      try {
        payload.addAddress = typeof addAddressVal === 'object' ? addAddressVal : JSON.parse(String(addAddressVal));
      } catch (_) {
        throw new Error('Update Following Profile: addAddressVariableKey must be valid JSON');
      }
    }

    const response = await sendMessage(payload);

    if (!response || response.ok === false) {
      throw new Error('Update Following Profile failed: ' + ((response && response.error) || 'Request failed'));
    }

    const data = response.data != null ? response.data : {};
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = data;
    }
  }, { needsElement: false });
})();
