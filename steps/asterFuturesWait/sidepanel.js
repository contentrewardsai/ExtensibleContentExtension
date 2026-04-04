(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterFuturesWait', {
    label: 'Aster futures (wait)',
    defaultAction: {
      type: 'asterFuturesWait',
      runIf: '',
      waitKind: 'order',
      symbol: '',
      orderId: '',
      origClientOrderId: '',
      targetOrderStatus: 'FILLED',
      positionWaitMode: 'nonzero',
      positionThreshold: '',
      balanceAsset: '',
      balanceWaitMode: 'availableAbove',
      balanceThreshold: '',
      recvWindow: '',
      pollIntervalMs: '2000',
      waitTimeoutMs: '120000',
      saveResultVariable: 'asterWaitResult',
    },
    getSummary: function (action) {
      var k = (action.waitKind || 'order').toString().trim();
      return 'Aster wait: ' + k;
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
