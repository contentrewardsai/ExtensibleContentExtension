(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscWatchRefresh', {
    label: 'BSC watch refresh',
    defaultAction: {
      type: 'bscWatchRefresh',
      runIf: '',
      saveResultVariable: 'bscWatchRefreshResult',
    },
    getSummary: function () {
      return 'BSC watch: refresh poll';
    },
    getVariableKey: function () { return ''; },
    getVariableHint: function () { return ''; },
    getExtraVariableKeys: function (action) {
      var out = [];
      var s = String(action.saveResultVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'Last tick JSON (optional)' });
      return out;
    },
  });
})();
