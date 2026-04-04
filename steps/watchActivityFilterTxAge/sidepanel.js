(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('watchActivityFilterTxAge', {
    label: 'Watch activity filter (tx age)',
    defaultAction: {
      type: 'watchActivityFilterTxAge',
      runIf: '',
      inputVariable: 'bscWatchActivity',
      maxAgeSec: '120',
      passRowsWithoutBlockTime: false,
      saveResultVariable: 'bscWatchActivity',
    },
    getSummary: function (action) {
      var sec = String(action.maxAgeSec || '').trim() || '?';
      return 'Watch activity: max age ' + sec + 's';
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
      if (s) out.push({ rowKey: s, label: s, hint: 'JSON: filtered activity[], latest, count' });
      return out;
    },
  });
})();
