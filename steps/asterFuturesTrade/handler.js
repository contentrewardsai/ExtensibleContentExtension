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
    if (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate) {
      return CFS_templateResolver.resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
    }
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

      var operation = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'operation', row, getRowValue) : trimResolved(row, getRowValue, action, action.operation));
      if (!operation) throw new Error('asterFuturesTrade: set operation');

      var dryRunRaw = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'dryRun', row, getRowValue) : trimResolved(row, getRowValue, action, action.dryRun));
      var validateFxRaw = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'validateExchangeFilters', row, getRowValue) : trimResolved(row, getRowValue, action, action.validateExchangeFilters));
      var roundFxRaw = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'roundToExchangeFilters', row, getRowValue) : trimResolved(row, getRowValue, action, action.roundToExchangeFilters));
      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'trade',
        operation: operation,
        recvWindow: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'recvWindow', row, getRowValue) : trimResolved(row, getRowValue, action, action.recvWindow)),
        symbol: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'symbol', row, getRowValue) : trimResolved(row, getRowValue, action, action.symbol)),
        side: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'side', row, getRowValue) : trimResolved(row, getRowValue, action, action.side)),
        positionSide: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'positionSide', row, getRowValue) : trimResolved(row, getRowValue, action, action.positionSide)),
        orderType: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'orderType', row, getRowValue) : trimResolved(row, getRowValue, action, action.orderType)),
        timeInForce: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'timeInForce', row, getRowValue) : trimResolved(row, getRowValue, action, action.timeInForce)),
        quantity: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'quantity', row, getRowValue) : trimResolved(row, getRowValue, action, action.quantity)),
        price: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'price', row, getRowValue) : trimResolved(row, getRowValue, action, action.price)),
        reduceOnly: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'reduceOnly', row, getRowValue) : trimResolved(row, getRowValue, action, action.reduceOnly)),
        newClientOrderId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'newClientOrderId', row, getRowValue) : trimResolved(row, getRowValue, action, action.newClientOrderId)),
        stopPrice: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'stopPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.stopPrice)),
        closePosition: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'closePosition', row, getRowValue) : trimResolved(row, getRowValue, action, action.closePosition)),
        activationPrice: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'activationPrice', row, getRowValue) : trimResolved(row, getRowValue, action, action.activationPrice)),
        callbackRate: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'callbackRate', row, getRowValue) : trimResolved(row, getRowValue, action, action.callbackRate)),
        workingType: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'workingType', row, getRowValue) : trimResolved(row, getRowValue, action, action.workingType)),
        priceProtect: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'priceProtect', row, getRowValue) : trimResolved(row, getRowValue, action, action.priceProtect)),
        newOrderRespType: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'newOrderRespType', row, getRowValue) : trimResolved(row, getRowValue, action, action.newOrderRespType)),
        orderId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'orderId', row, getRowValue) : trimResolved(row, getRowValue, action, action.orderId)),
        origClientOrderId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'origClientOrderId', row, getRowValue) : trimResolved(row, getRowValue, action, action.origClientOrderId)),
        leverage: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'leverage', row, getRowValue) : trimResolved(row, getRowValue, action, action.leverage)),
        marginType: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'marginType', row, getRowValue) : trimResolved(row, getRowValue, action, action.marginType)),
        batchOrders: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'batchOrders', row, getRowValue) : trimResolved(row, getRowValue, action, action.batchOrders)),
        countdownTime: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'countdownTime', row, getRowValue) : trimResolved(row, getRowValue, action, action.countdownTime)),
        orderIdList: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'orderIdList', row, getRowValue) : trimResolved(row, getRowValue, action, action.orderIdList)),
        origClientOrderIdList: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'origClientOrderIdList', row, getRowValue) : trimResolved(row, getRowValue, action, action.origClientOrderIdList)),
        dualSidePosition: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'dualSidePosition', row, getRowValue) : trimResolved(row, getRowValue, action, action.dualSidePosition)),
        multiAssetsMargin: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'multiAssetsMargin', row, getRowValue) : trimResolved(row, getRowValue, action, action.multiAssetsMargin)),
        amount: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'positionMarginAmount', row, getRowValue) : trimResolved(row, getRowValue, action, action.positionMarginAmount)),
        positionMarginType: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'positionMarginType', row, getRowValue) : trimResolved(row, getRowValue, action, action.positionMarginType)),
        clientOrderIdPrefix: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'clientOrderIdPrefix', row, getRowValue) : trimResolved(row, getRowValue, action, action.clientOrderIdPrefix)),
        listenKey: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'listenKey', row, getRowValue) : trimResolved(row, getRowValue, action, action.listenKey)),
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
        var keyVar = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'saveResultVariable', row, getRowValue) : trimResolved(row, getRowValue, action, action.saveResultVariable));
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
