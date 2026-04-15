(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getShotstackCredits', {
    label: 'Get ShotStack Credits',
    defaultAction: {
      type: 'getShotstackCredits',
      runIf: '',
      saveAsVariable: 'shotstackCredits',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get ShotStack Credits \u2192 ' + saveVar : 'Get ShotStack Credits';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'credits object' });
      return out;
    },
  });
})();
