(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaWatchRefresh', {
    label: 'Solana watch refresh',
    defaultAction: {
      type: 'solanaWatchRefresh',
      runIf: '',
      skipJitter: false,
      saveResultVariable: 'solanaWatchRefreshResult',
    },
    getSummary: function (action) {
      return action.skipJitter ? 'Solana watch: refresh now' : 'Solana watch: refresh (poll)';
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
      if (s) out.push({ rowKey: s, label: s, hint: 'JSON: last tick summary' });
      return out;
    },
  });
})();
