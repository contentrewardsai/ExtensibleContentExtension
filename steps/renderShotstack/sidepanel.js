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
      renderStrategy: 'shotstack',
      localFallbackPluginId: '',
      localFallbackInputMap: '',
      saveAsVariable: 'shotstackResult',
      saveRenderIdVariable: '',
      saveRenderMethodVariable: '',
      timeoutMs: 300000,
    },
    getSummary: function (action) {
      var env = action.environment === 'v1' ? 'prod' : 'stage';
      var fmt = action.outputFormat || 'mp4';
      var strategy = (action.renderStrategy || 'shotstack').trim();
      var strategyLabel = '';
      if (strategy === 'credit-gate') strategyLabel = ' \u2022 credit-gate';
      else if (strategy === 'shotstack-first') strategyLabel = ' \u2022 \u2193local';
      else if (strategy === 'local-first') strategyLabel = ' \u2022 local\u2191';
      else if (strategy === 'local') strategyLabel = ' \u2022 local';
      return 'ShotStack ' + fmt + ' (' + env + ')' + strategyLabel;
    },
    getExtraVariableKeys: function (action) {
      var out = [];
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'rendered file URL' });
      var idVar = (action.saveRenderIdVariable || '').trim();
      if (idVar) out.push({ rowKey: idVar, label: idVar, hint: 'ShotStack render ID' });
      var methodVar = (action.saveRenderMethodVariable || '').trim();
      if (methodVar) out.push({ rowKey: methodVar, label: methodVar, hint: 'render method: shotstack or local' });
      return out;
    },
  });
})();
