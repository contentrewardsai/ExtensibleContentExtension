/**
 * Aster futures composite reads for analysis (quote, fees+funding, position context).
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
    'asterFuturesAnalysis',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterFuturesAnalysis)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var row = currentRow;

      var operation = trimResolved(row, getRowValue, action, action.operation);
      if (!operation) throw new Error('asterFuturesAnalysis: set operation');

      var msg = {
        type: 'CFS_ASTER_FUTURES',
        asterCategory: 'analysis',
        operation: operation,
        recvWindow: trimResolved(row, getRowValue, action, action.recvWindow),
        symbol: trimResolved(row, getRowValue, action, action.symbol),
      };

      var response = await sendMessage(msg);
      if (!response || !response.ok) {
        var err = (response && response.error) ? response.error : 'Aster analysis request failed';
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
        if (action.flattenToRow === true && response.result && typeof response.result === 'object') {
          var flat = response.result;
          if (flat.bookTicker) {
            if (flat.bookTicker.bidPrice != null) row.asterBid = flat.bookTicker.bidPrice;
            if (flat.bookTicker.askPrice != null) row.asterAsk = flat.bookTicker.askPrice;
          }
          if (flat.premiumIndex) {
            if (flat.premiumIndex.markPrice != null) row.asterMarkPrice = flat.premiumIndex.markPrice;
            if (flat.premiumIndex.lastFundingRate != null) row.asterFundingRate = flat.premiumIndex.lastFundingRate;
            if (flat.premiumIndex.nextFundingTime != null) row.asterNextFundingTime = flat.premiumIndex.nextFundingTime;
          }
          if (flat.lastPrice != null) row.asterLastPrice = flat.lastPrice;
          if (flat.mid != null) row.asterMid = flat.mid;
          if (flat.spreadPct != null) row.asterSpreadPct = flat.spreadPct;
          if (flat.position && typeof flat.position === 'object') {
            var pos = flat.position;
            if (pos.positionAmt != null) row.asterPositionAmt = pos.positionAmt;
            if (pos.entryPrice != null) row.asterEntryPrice = pos.entryPrice;
            if (pos.unRealizedProfit != null) row.asterUnrealizedPnl = pos.unRealizedProfit;
            if (pos.leverage != null) row.asterLeverage = pos.leverage;
          }
          if (flat.openOrderCount != null) row.asterOpenOrderCount = flat.openOrderCount;
          if (flat.openAlgoOrderCount != null) row.asterOpenAlgoOrderCount = flat.openAlgoOrderCount;
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
