(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('rugcheckToken', {
    label: 'Rugcheck token (Solana)',
    defaultAction: {
      type: 'rugcheckToken',
      runIf: '',
      mint: '',
      maxScoreNormalised: '',
      failOnError: false,
      saveResultVariable: '',
    },
    getSummary: function (action) {
      var m = String(action.maxScoreNormalised || '').trim();
      return 'Rugcheck' + (m ? ' · max norm ' + m : '');
    },
    getVariableKey: function () {
      return '';
    },
    getVariableHint: function () {
      return '';
    },
    getExtraVariableKeys: function (action) {
      var out = [];
      var s = String(action.saveResultVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'Rugcheck report JSON' });
      return out;
    },
  });
})();
