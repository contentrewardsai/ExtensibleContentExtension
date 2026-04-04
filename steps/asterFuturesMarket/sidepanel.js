(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterFuturesMarket', {
    label: 'Aster futures (public)',
    defaultAction: {
      type: 'asterFuturesMarket',
      runIf: '',
      operation: 'ping',
      symbol: '',
      pair: '',
      limit: '',
      interval: '1h',
      fromId: '',
      startTime: '',
      endTime: '',
      saveResultVariable: 'asterMarketResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster public: ' + op : 'Aster futures (public)';
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
      if (s) out.push({ rowKey: s, label: s, hint: 'JSON result' });
      return out;
    },
  });
})();
