(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('asterSpotTrade', {
    label: 'Aster spot (trade)',
    defaultAction: {
      type: 'asterSpotTrade',
      runIf: '',
      operation: 'placeOrder',
      recvWindow: '',
      symbol: '',
      side: '',
      orderType: 'MARKET',
      timeInForce: 'GTC',
      quantity: '',
      quoteOrderQty: '',
      price: '',
      newClientOrderId: '',
      stopPrice: '',
      icebergQty: '',
      newOrderRespType: '',
      orderId: '',
      origClientOrderId: '',
      batchOrders: '',
      dryRun: '',
      validateExchangeFilters: '',
      roundToExchangeFilters: '',
      saveResultVariable: 'asterSpotTradeResult',
    },
    getSummary: function (action) {
      var op = (action.operation || '').toString().trim();
      return op ? 'Aster spot trade: ' + op : 'Aster spot (trade)';
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
