(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('updateFollowingProfile', {
    label: 'Update Following Profile',
    defaultAction: {
      profileIdVariableKey: '',
      profileNameVariableKey: 'profileName',
      nameVariableKey: '',
      birthdayVariableKey: '',
      addAccountHandleVariableKey: '',
      addAccountPlatformVariableKey: '',
      addAccountUrlVariableKey: '',
      addPhoneVariableKey: '',
      addEmailVariableKey: '',
      addAddressVariableKey: '',
      addNoteVariableKey: '',
      saveAsVariable: 'updateResult',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Update Following Profile \u2192 ' + saveVar : 'Update Following Profile';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'result object' });
      return out;
    },
  });
})();
