(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('getShotstackRenders', {
    label: 'Get ShotStack Renders',
    defaultAction: {
      type: 'getShotstackRenders',
      runIf: '',
      limitVariableKey: '',
      environmentVariableKey: '',
      saveAsVariable: 'shotstackRenders',
    },
    getSummary: function(action) {
      var saveVar = (action.saveAsVariable || '').trim();
      return saveVar ? 'Get ShotStack Renders \u2192 ' + saveVar : 'Get ShotStack Renders';
    },
    getExtraVariableKeys: function(action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'render history array' });
      return out;
    },
  });
})();
