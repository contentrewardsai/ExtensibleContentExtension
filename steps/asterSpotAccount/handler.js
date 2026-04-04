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

      var operation = trimResolved(row, getRowValue, action, action.operation);
      if (!operation) throw new Error('asterSpotAccount: set operation');

      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'spotAccount',
        operation: operation,
        recvWindow: trimResolved(row, getRowValue, action, action.recvWindow),
        symbol: trimResolved(row, getRowValue, action, action.symbol),
        orderId: trimResolved(row, getRowValue, action, action.orderId),
        origClientOrderId: trimResolved(row, getRowValue, action, action.origClientOrderId),
        startTime: trimResolved(row, getRowValue, action, action.startTime),
        endTime: trimResolved(row, getRowValue, action, action.endTime),
        limit: trimResolved(row, getRowValue, action, action.limit),
        fromId: trimResolved(row, getRowValue, action, action.fromId),
        listenKey: trimResolved(row, getRowValue, action, action.listenKey),
        wsStreamBase: trimResolved(row, getRowValue, action, action.wsStreamBase),
        transferAsset: trimResolved(row, getRowValue, action, action.transferAsset),
        transferAmount: trimResolved(row, getRowValue, action, action.transferAmount),
        futuresTransferType: trimResolved(row, getRowValue, action, action.futuresTransferType),
        transferHistoryAsset: trimResolved(row, getRowValue, action, action.transferHistoryAsset),
        transferHistoryPage: trimResolved(row, getRowValue, action, action.transferHistoryPage),
        transferHistorySize: trimResolved(row, getRowValue, action, action.transferHistorySize),
      };
      var createLk = trimResolved(row, getRowValue, action, action.createListenKey);
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
