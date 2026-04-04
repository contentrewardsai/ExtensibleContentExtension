(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterSpotAccount', {
    label: 'Aster spot (account)',
    defaultAction: {
      type: 'asterSpotAccount',
      runIf: '',
      operation: 'account',
      recvWindow: '',
      symbol: '',
      orderId: '',
      origClientOrderId: '',
      startTime: '',
      endTime: '',
      limit: '',
      fromId: '',
      listenKey: '',
      wsStreamBase: '',
      createListenKey: '',
      transferAsset: '',
      transferAmount: '',
      futuresTransferType: '',
      transferHistoryAsset: '',
      transferHistoryPage: '',
      transferHistorySize: '',
      saveResultVariable: 'asterSpotAccountResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster spot account: ' + op : 'Aster spot (account)';
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
