(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getUploadPostProfiles', {
    label: 'Get Upload Post Profiles',
    defaultAction: {
      type: 'getUploadPostProfiles',
      runIf: '',
      saveAsVariable: 'uploadPostProfiles',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Upload Post Profiles \u2192 ' + saveVar : 'Get Upload Post Profiles';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'profiles array' });
      return out;
    },
  });
})();
