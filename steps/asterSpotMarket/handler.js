/**
 * Aster spot public REST (no API key). sapi.asterdex.com /api/v3 (Binance-style).
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
    'asterSpotMarket',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterSpotMarket)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var row = currentRow;

      var operation = trimResolved(row, getRowValue, action, action.operation);
      if (!operation) throw new Error('asterSpotMarket: set operation');

      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'spotMarket',
        operation: operation,
        symbol: trimResolved(row, getRowValue, action, action.symbol),
        limit: trimResolved(row, getRowValue, action, action.limit),
        interval: trimResolved(row, getRowValue, action, action.interval),
        fromId: trimResolved(row, getRowValue, action, action.fromId),
        startTime: trimResolved(row, getRowValue, action, action.startTime),
        endTime: trimResolved(row, getRowValue, action, action.endTime),
      };

      var response = await sendMessage(msg);
      if (!response || !response.ok) {
        var err = (response && response.error) ? response.error : 'Aster spot market request failed';
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
