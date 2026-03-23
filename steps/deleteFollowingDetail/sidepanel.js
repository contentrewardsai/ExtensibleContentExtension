(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('deleteFollowingDetail', {
    label: 'Delete Following Detail',
    defaultAction: {
      detailTypeVariableKey: 'detailType',
      detailIdVariableKey: 'detailId',
      saveAsVariable: 'deleteDetailResult',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Delete Following Detail \u2192 ' + saveVar : 'Delete Following Detail';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'result object' });
      return out;
    },
  });
})();
