(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getStorageInfo', {
    label: 'Get Storage Info',
    defaultAction: {
      type: 'getStorageInfo',
      runIf: '',
      saveAsVariable: 'storageInfo',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Storage Info \u2192 ' + saveVar : 'Get Storage Info';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'storage info object' });
      return out;
    },
  });
})();
