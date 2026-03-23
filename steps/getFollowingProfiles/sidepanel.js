(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getFollowingProfiles', {
    label: 'Get Following Profiles',
    defaultAction: { nameFilterVariableKey: '', saveAsVariable: 'followingProfiles' },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Following Profiles → ' + saveVar : 'Get Following Profiles';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'array of profile objects' });
      return out;
    },
  });
})();
