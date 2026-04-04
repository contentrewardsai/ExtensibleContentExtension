(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterFuturesAccount', {
    label: 'Aster futures (account read)',
    defaultAction: {
      type: 'asterFuturesAccount',
      runIf: '',
      operation: 'balance',
      recvWindow: '',
      symbol: '',
      orderId: '',
      origClientOrderId: '',
      startTime: '',
      endTime: '',
      limit: '',
      fromId: '',
      incomeType: '',
      autoCloseType: '',
      listenKey: '',
      wsStreamBase: '',
      createListenKey: '',
      saveResultVariable: 'asterAccountResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster account: ' + op : 'Aster futures (account read)';
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
