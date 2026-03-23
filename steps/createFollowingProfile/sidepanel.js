(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('createFollowingProfile', {
    label: 'Create Following Profile',
    defaultAction: { nameVariableKey: 'profileName', birthdayVariableKey: '', saveAsVariable: 'createdProfileId' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Create Following Profile \u2192 ' + saveVar : 'Create Following Profile';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'profile ID' });
      return out;
    },
  });
})();
