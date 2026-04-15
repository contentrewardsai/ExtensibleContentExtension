(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getStorageFiles', {
    label: 'Get Storage Files',
    defaultAction: {
      type: 'getStorageFiles',
      runIf: '',
      pageVariableKey: '',
      limitVariableKey: '',
      saveAsVariable: 'storageFiles',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Storage Files \u2192 ' + saveVar : 'Get Storage Files';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'storage files array' });
      return out;
    },
  });
})();
