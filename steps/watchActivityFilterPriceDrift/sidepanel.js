(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('watchActivityFilterPriceDrift', {
    label: 'Watch activity filter (price drift)',
    defaultAction: {
      type: 'watchActivityFilterPriceDrift',
      runIf: '',
      inputVariable: 'bscWatchActivity',
      maxDriftPercentBuy: '',
      maxDriftPercentSell: '',
      maxDriftPercentBoth: '2',
      amountRaw: '',
      slippageBps: '50',
      chain: '',
      saveResultVariable: 'bscWatchActivity',
    },
    getSummary: function (action) {
      var b = String(action.maxDriftPercentBoth || '').trim();
      return 'Watch activity: price drift' + (b ? ' (both ≤' + b + '%)' : '');
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
