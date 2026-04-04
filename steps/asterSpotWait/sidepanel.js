(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterSpotWait', {
    label: 'Aster spot (wait)',
    defaultAction: {
      type: 'asterSpotWait',
      runIf: '',
      waitKind: 'order',
      symbol: '',
      orderId: '',
      origClientOrderId: '',
      targetOrderStatus: 'FILLED',
      balanceAsset: '',
      balanceWaitMode: 'freeAbove',
      balanceThreshold: '',
      recvWindow: '',
      pollIntervalMs: '2000',
      waitTimeoutMs: '120000',
      saveResultVariable: 'asterSpotWaitResult',
    },
    getSummary: function (action) {
      var k = (action.waitKind || 'order').toString().trim();
      return 'Aster spot wait: ' + k;
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
      if (s) out.push({ rowKey: s, label: s, hint: 'last poll JSON' });
      return out;
    },
  });
})();
