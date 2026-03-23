(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('renderShotstack', {
    label: 'Render with ShotStack',
    defaultAction: {
      type: 'renderShotstack',
      runIf: '',
      shotstackJsonVariableKey: '',
      environment: 'stage',
      outputFormat: 'mp4',
      resolutionScale: 'auto',
      saveAsVariable: 'shotstackResult',
      saveRenderIdVariable: '',
      timeoutMs: 300000,
    },
    getSummary: function (action) {
      var env = action.environment === 'v1' ? 'prod' : 'stage';
      var fmt = action.outputFormat || 'mp4';
      return 'ShotStack ' + fmt + ' (' + env + ')';
    },
    getExtraVariableKeys: function (action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'rendered file URL' });
      var idVar = (action.saveRenderIdVariable || '').trim();
      if (idVar) out.push({ rowKey: idVar, label: idVar, hint: 'ShotStack render ID' });
      return out;
    },
  });
})();
