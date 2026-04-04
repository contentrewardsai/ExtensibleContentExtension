(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('bscWatchReadActivity', {
    label: 'BSC watch read activity',
    defaultAction: {
      type: 'bscWatchReadActivity',
      runIf: '',
      limit: '40',
      applyClientFilters: true,
      filterAddress: '',
      sinceTimestampMs: '',
      saveResultVariable: 'bscWatchActivity',
    },
    getSummary: function (action) {
      var lim = String(action.limit || '40').trim() || '40';
      return 'BSC watch: read activity (limit ' + lim + ')';
    },
    getVariableKey: function () { return ''; },
    getVariableHint: function () { return ''; },
    getExtraVariableKeys: function (action) {
      var out = [];
      var s = String(action.saveResultVariable || '').trim();
      if (s) out.push({ rowKey: s, label: s, hint: 'JSON: activity[], latest, count' });
      return out;
    },
  });
})();
