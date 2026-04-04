(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterFuturesTrade', {
    label: 'Aster futures (trade)',
    defaultAction: {
      type: 'asterFuturesTrade',
      runIf: '',
      operation: 'placeOrder',
      recvWindow: '',
      symbol: '',
      side: '',
      positionSide: '',
      orderType: 'MARKET',
      timeInForce: 'GTC',
      quantity: '',
      price: '',
      reduceOnly: '',
      newClientOrderId: '',
      stopPrice: '',
      closePosition: '',
      activationPrice: '',
      callbackRate: '',
      workingType: '',
      priceProtect: '',
      newOrderRespType: '',
      orderId: '',
      origClientOrderId: '',
      leverage: '',
      marginType: '',
      batchOrders: '',
      dryRun: '',
      validateExchangeFilters: '',
      roundToExchangeFilters: '',
      countdownTime: '',
      orderIdList: '',
      origClientOrderIdList: '',
      dualSidePosition: '',
      multiAssetsMargin: '',
      positionMarginAmount: '',
      positionMarginType: '',
      clientOrderIdPrefix: '',
      listenKey: '',
      saveResultVariable: 'asterTradeResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster trade: ' + op : 'Aster futures (trade)';
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
      out.push({ rowKey: 'asterTradeWarning', label: 'asterTradeWarning', hint: 'optional warning' });
      return out;
    },
  });
})();
