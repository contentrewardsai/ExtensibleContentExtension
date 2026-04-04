/**
 * Aster spot trading (sapi). Requires Settings: keys + Allow spot trading.
 */
(function () {
  'use strict';

  var resolveTemplate =
    typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate
      ? CFS_templateResolver.resolveTemplate
      : function (str, row, getRowValue, action) {
          if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
          return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
            var k = key.trim();
            var v = getRowValue(row, k);
            return v != null ? String(v) : '';
          });
        };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  window.__CFS_registerStepHandler(
    'asterSpotTrade',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterSpotTrade)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var row = currentRow;

      var operation = trimResolved(row, getRowValue, action, action.operation);
      if (!operation) throw new Error('asterSpotTrade: set operation');

      var dryRunRaw = trimResolved(row, getRowValue, action, action.dryRun);
      var validateFxRaw = trimResolved(row, getRowValue, action, action.validateExchangeFilters);
      var roundFxRaw = trimResolved(row, getRowValue, action, action.roundToExchangeFilters);

      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'spotTrade',
        operation: operation,
        recvWindow: trimResolved(row, getRowValue, action, action.recvWindow),
        symbol: trimResolved(row, getRowValue, action, action.symbol),
        side: trimResolved(row, getRowValue, action, action.side),
        orderType: trimResolved(row, getRowValue, action, action.orderType),
        timeInForce: trimResolved(row, getRowValue, action, action.timeInForce),
        quantity: trimResolved(row, getRowValue, action, action.quantity),
        quoteOrderQty: trimResolved(row, getRowValue, action, action.quoteOrderQty),
        price: trimResolved(row, getRowValue, action, action.price),
        newClientOrderId: trimResolved(row, getRowValue, action, action.newClientOrderId),
        stopPrice: trimResolved(row, getRowValue, action, action.stopPrice),
        icebergQty: trimResolved(row, getRowValue, action, action.icebergQty),
        newOrderRespType: trimResolved(row, getRowValue, action, action.newOrderRespType),
        orderId: trimResolved(row, getRowValue, action, action.orderId),
        origClientOrderId: trimResolved(row, getRowValue, action, action.origClientOrderId),
        batchOrders: trimResolved(row, getRowValue, action, action.batchOrders),
      };
      if (/^(true|false)$/i.test(dryRunRaw)) msg.dryRun = /^true$/i.test(dryRunRaw);
      if (/^(true|false)$/i.test(validateFxRaw)) msg.validateExchangeFilters = /^true$/i.test(validateFxRaw);
      if (/^(true|false)$/i.test(roundFxRaw)) msg.roundToExchangeFilters = /^true$/i.test(roundFxRaw);

      var response = await sendMessage(msg);
      if (!response || !response.ok) {
        var err = (response && response.error) ? response.error : 'Aster spot trade request failed';
        if (response && response.unknownState) err += ' (unknown state / HTTP 503)';
        throw new Error(err);
      }

      if (row && typeof row === 'object') {
        var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
        if (keyVar && response.result != null) {
          try {
            row[keyVar] = JSON.stringify(response.result);
          } catch (_) {
            row[keyVar] = String(response.result);
          }
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
