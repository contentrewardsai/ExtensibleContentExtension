(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('deleteFollowingProfile', {
    label: 'Delete Following Profile',
    defaultAction: {
      profileIdVariableKey: '',
      profileNameVariableKey: '',
      saveAsVariable: 'deleteResult',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Delete Following Profile \u2192 ' + saveVar : 'Delete Following Profile';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'result object' });
      return out;
    },
  });
})();
