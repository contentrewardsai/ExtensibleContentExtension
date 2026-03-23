(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getFollowingProfile', {
    label: 'Get Following Profile',
    defaultAction: { profileNameVariableKey: '', profileIdVariableKey: '', saveAsVariable: 'followingProfile' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Following Profile \u2192 ' + saveVar : 'Get Following Profile';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'profile object' });
      return out;
    },
  });
})();
