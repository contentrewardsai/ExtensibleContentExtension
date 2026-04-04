/**
 * Aster futures trading (TRADE). Requires Settings: keys + "Allow futures trading".
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
    'asterFuturesTrade',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterFuturesTrade)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var row = currentRow;

      var operation = trimResolved(row, getRowValue, action, action.operation);
      if (!operation) throw new Error('asterFuturesTrade: set operation');

      var dryRunRaw = trimResolved(row, getRowValue, action, action.dryRun);
      var validateFxRaw = trimResolved(row, getRowValue, action, action.validateExchangeFilters);
      var roundFxRaw = trimResolved(row, getRowValue, action, action.roundToExchangeFilters);
      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'trade',
        operation: operation,
        recvWindow: trimResolved(row, getRowValue, action, action.recvWindow),
        symbol: trimResolved(row, getRowValue, action, action.symbol),
        side: trimResolved(row, getRowValue, action, action.side),
        positionSide: trimResolved(row, getRowValue, action, action.positionSide),
        orderType: trimResolved(row, getRowValue, action, action.orderType),
        timeInForce: trimResolved(row, getRowValue, action, action.timeInForce),
        quantity: trimResolved(row, getRowValue, action, action.quantity),
        price: trimResolved(row, getRowValue, action, action.price),
        reduceOnly: trimResolved(row, getRowValue, action, action.reduceOnly),
        newClientOrderId: trimResolved(row, getRowValue, action, action.newClientOrderId),
        stopPrice: trimResolved(row, getRowValue, action, action.stopPrice),
        closePosition: trimResolved(row, getRowValue, action, action.closePosition),
        activationPrice: trimResolved(row, getRowValue, action, action.activationPrice),
        callbackRate: trimResolved(row, getRowValue, action, action.callbackRate),
        workingType: trimResolved(row, getRowValue, action, action.workingType),
        priceProtect: trimResolved(row, getRowValue, action, action.priceProtect),
        newOrderRespType: trimResolved(row, getRowValue, action, action.newOrderRespType),
        orderId: trimResolved(row, getRowValue, action, action.orderId),
        origClientOrderId: trimResolved(row, getRowValue, action, action.origClientOrderId),
        leverage: trimResolved(row, getRowValue, action, action.leverage),
        marginType: trimResolved(row, getRowValue, action, action.marginType),
        batchOrders: trimResolved(row, getRowValue, action, action.batchOrders),
        countdownTime: trimResolved(row, getRowValue, action, action.countdownTime),
        orderIdList: trimResolved(row, getRowValue, action, action.orderIdList),
        origClientOrderIdList: trimResolved(row, getRowValue, action, action.origClientOrderIdList),
        dualSidePosition: trimResolved(row, getRowValue, action, action.dualSidePosition),
        multiAssetsMargin: trimResolved(row, getRowValue, action, action.multiAssetsMargin),
        amount: trimResolved(row, getRowValue, action, action.positionMarginAmount),
        positionMarginType: trimResolved(row, getRowValue, action, action.positionMarginType),
        clientOrderIdPrefix: trimResolved(row, getRowValue, action, action.clientOrderIdPrefix),
        listenKey: trimResolved(row, getRowValue, action, action.listenKey),
      };
      if (/^(true|false)$/i.test(dryRunRaw)) msg.dryRun = /^true$/i.test(dryRunRaw);
      if (/^(true|false)$/i.test(validateFxRaw)) msg.validateExchangeFilters = /^true$/i.test(validateFxRaw);
      if (/^(true|false)$/i.test(roundFxRaw)) msg.roundToExchangeFilters = /^true$/i.test(roundFxRaw);

      var response = await sendMessage(msg);
      if (!response || !response.ok) {
        var err = (response && response.error) ? response.error : 'Aster trade request failed';
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
        if (response.warning) {
          row.asterTradeWarning = String(response.warning);
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
