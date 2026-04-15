(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getAccountStatus', {
    label: 'Get Account Status',
    defaultAction: {
      type: 'getAccountStatus',
      runIf: '',
      saveAsVariable: 'accountStatus',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get Account Status \u2192 ' + saveVar : 'Get Account Status';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'account status object' });
      return out;
    },
  });
})();
