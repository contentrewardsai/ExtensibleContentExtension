/**
 * Aster spot signed USER_DATA reads (sapi). Same API keys as futures; see Settings.
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
    'asterSpotAccount',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterSpotAccount)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var row = currentRow;

      var operation = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'operation', row, getRowValue) : trimResolved(row, getRowValue, action, action.operation));
      if (!operation) throw new Error('asterSpotAccount: set operation');

      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'spotAccount',
        operation: operation,
        recvWindow: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'recvWindow', row, getRowValue) : trimResolved(row, getRowValue, action, action.recvWindow)),
        symbol: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'symbol', row, getRowValue) : trimResolved(row, getRowValue, action, action.symbol)),
        orderId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'orderId', row, getRowValue) : trimResolved(row, getRowValue, action, action.orderId)),
        origClientOrderId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'origClientOrderId', row, getRowValue) : trimResolved(row, getRowValue, action, action.origClientOrderId)),
        startTime: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'startTime', row, getRowValue) : trimResolved(row, getRowValue, action, action.startTime)),
        endTime: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'endTime', row, getRowValue) : trimResolved(row, getRowValue, action, action.endTime)),
        limit: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'limit', row, getRowValue) : trimResolved(row, getRowValue, action, action.limit)),
        fromId: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'fromId', row, getRowValue) : trimResolved(row, getRowValue, action, action.fromId)),
        listenKey: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'listenKey', row, getRowValue) : trimResolved(row, getRowValue, action, action.listenKey)),
        wsStreamBase: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'wsStreamBase', row, getRowValue) : trimResolved(row, getRowValue, action, action.wsStreamBase)),
        transferAsset: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'transferAsset', row, getRowValue) : trimResolved(row, getRowValue, action, action.transferAsset)),
        transferAmount: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'transferAmount', row, getRowValue) : trimResolved(row, getRowValue, action, action.transferAmount)),
        futuresTransferType: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'futuresTransferType', row, getRowValue) : trimResolved(row, getRowValue, action, action.futuresTransferType)),
        transferHistoryAsset: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'transferHistoryAsset', row, getRowValue) : trimResolved(row, getRowValue, action, action.transferHistoryAsset)),
        transferHistoryPage: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'transferHistoryPage', row, getRowValue) : trimResolved(row, getRowValue, action, action.transferHistoryPage)),
        transferHistorySize: ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'transferHistorySize', row, getRowValue) : trimResolved(row, getRowValue, action, action.transferHistorySize)),
      };
      var createLk = ((typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveActionField) ? CFS_templateResolver.resolveActionField(action, 'createListenKey', row, getRowValue) : trimResolved(row, getRowValue, action, action.createListenKey));
      if (/^(true|false)$/i.test(createLk)) {
        msg.createListenKey = /^true$/i.test(createLk);
      }

      var response = await sendMessage(msg);
      if (!response || !response.ok) {
        var err = (response && response.error) ? response.error : 'Aster spot account request failed';
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
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
