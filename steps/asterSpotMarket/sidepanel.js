(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterSpotMarket', {
    label: 'Aster spot (public)',
    defaultAction: {
      type: 'asterSpotMarket',
      runIf: '',
      operation: 'ping',
      symbol: '',
      limit: '',
      interval: '1h',
      fromId: '',
      startTime: '',
      endTime: '',
      saveResultVariable: 'asterSpotMarketResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster spot: ' + op : 'Aster spot (public)';
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
