/**
 * Poll Aster futures until order status or position size matches.
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

  function parseStatusSet(s) {
    var out = {};
    String(s || '')
      .split(/[,|]+/)
      .forEach(function (x) {
        var t = x.trim().toUpperCase();
        if (t) out[t] = true;
      });
    return out;
  }

  function findFuturesBalanceRow(rows, asset) {
    var a = String(asset || '').trim().toUpperCase();
    if (!a || !Array.isArray(rows)) return null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].asset || '').toUpperCase() === a) return rows[i];
    }
    return null;
  }

  window.__CFS_registerStepHandler(
    'asterFuturesWait',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterFuturesWait)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var sleep = ctx.sleep;
      var assertPlaying = ctx.assertPlaying;
      var row = currentRow;

      var waitKind = trimResolved(row, getRowValue, action, action.waitKind) || 'order';
      var symbol = trimResolved(row, getRowValue, action, action.symbol);
      if (waitKind !== 'balance' && !symbol) throw new Error('asterFuturesWait: symbol required (order/position wait)');

      var pollMs = Math.max(500, parseInt(action.pollIntervalMs, 10) || 2000);
      var timeoutMs = Math.max(1000, parseInt(action.waitTimeoutMs, 10) || 120000);
      var deadline = Date.now() + timeoutMs;
      var recvWindow = trimResolved(row, getRowValue, action, action.recvWindow);

      var targetStatuses = parseStatusSet(
        trimResolved(row, getRowValue, action, action.targetOrderStatus) || 'FILLED',
      );

      var fbalAsset = trimResolved(row, getRowValue, action, action.balanceAsset);
      var fbalMode = trimResolved(row, getRowValue, action, action.balanceWaitMode) || 'availableAbove';
      var fbalThr = parseFloat(trimResolved(row, getRowValue, action, action.balanceThreshold));
      if (waitKind === 'balance') {
        if (!fbalAsset) throw new Error('asterFuturesWait (balance): balanceAsset required');
        if (!Number.isFinite(fbalThr)) throw new Error('asterFuturesWait (balance): balanceThreshold must be a number');
      }

      var lastPayload = null;
      var matched = false;

      while (Date.now() < deadline) {
        if (typeof assertPlaying === 'function') assertPlaying();

        if (waitKind === 'balance') {
          var br = await sendMessage({
            type: 'CFS_ASTER_FUTURES',
            asterCategory: 'account',
            operation: 'balance',
            recvWindow: recvWindow,
          });
          if (!br || !br.ok) {
            if (br && br.unknownState) {
              throw new Error((br && br.error) ? br.error : 'balance: unknown state (503)');
            }
            throw new Error((br && br.error) || 'balance failed');
          }
          var blist = Array.isArray(br.result) ? br.result : [];
          var frow = findFuturesBalanceRow(blist, fbalAsset);
          var avail = frow ? parseFloat(frow.availableBalance) : 0;
          var wall = frow ? parseFloat(frow.balance != null ? frow.balance : frow.crossWalletBalance) : 0;
          if (!Number.isFinite(avail)) avail = 0;
          if (!Number.isFinite(wall)) wall = 0;
          var okF = false;
          if (fbalMode === 'availableBelow') okF = avail < fbalThr;
          else if (fbalMode === 'walletAbove') okF = wall > fbalThr;
          else if (fbalMode === 'walletBelow') okF = wall < fbalThr;
          else okF = avail > fbalThr;
          lastPayload = { asset: fbalAsset, availableBalance: avail, walletBalance: wall, row: frow };
          if (okF) {
            matched = true;
            break;
          }
        } else if (waitKind === 'position') {
          var mode = trimResolved(row, getRowValue, action, action.positionWaitMode) || 'nonzero';
          var thr = parseFloat(trimResolved(row, getRowValue, action, action.positionThreshold));
          var pr = await sendMessage({
            type: 'CFS_ASTER_FUTURES',
            asterCategory: 'account',
            operation: 'positionRisk',
            symbol: symbol,
            recvWindow: recvWindow,
          });
          if (!pr || !pr.ok) {
            if (pr && pr.unknownState) {
              throw new Error((pr && pr.error) ? pr.error : 'positionRisk: unknown state (503)');
            }
            throw new Error((pr && pr.error) || 'positionRisk failed');
          }
          var list = Array.isArray(pr.result) ? pr.result : [];
          var pos = null;
          for (var i = 0; i < list.length; i++) {
            if (String(list[i].symbol || '').toUpperCase() === symbol.toUpperCase()) {
              pos = list[i];
              break;
            }
          }
          var amt = pos ? parseFloat(pos.positionAmt) : 0;
          var ok = false;
          if (mode === 'zero' || mode === 'flat') ok = !Number.isFinite(amt) || Math.abs(amt) < 1e-12;
          else if (mode === 'absAbove' && Number.isFinite(thr)) ok = Number.isFinite(amt) && Math.abs(amt) > thr;
          else ok = Number.isFinite(amt) && Math.abs(amt) > 1e-12;
          lastPayload = { position: pos, positionAmt: amt };
          if (ok) {
            matched = true;
            break;
          }
        } else {
          var oid = trimResolved(row, getRowValue, action, action.orderId);
          var oc = trimResolved(row, getRowValue, action, action.origClientOrderId);
          if (!oid && !oc) throw new Error('asterFuturesWait (order): orderId or origClientOrderId required');
          var qr = await sendMessage({
            type: 'CFS_ASTER_FUTURES',
            asterCategory: 'account',
            operation: 'queryOrder',
            symbol: symbol,
            orderId: oid,
            origClientOrderId: oc,
            recvWindow: recvWindow,
          });
          if (!qr || !qr.ok) {
            if (qr && qr.unknownState) {
              throw new Error((qr && qr.error) ? qr.error : 'queryOrder: unknown state (503)');
            }
            throw new Error((qr && qr.error) || 'queryOrder failed');
          }
          var st = qr.result && qr.result.status ? String(qr.result.status).toUpperCase() : '';
          lastPayload = qr.result;
          if (st && targetStatuses[st]) {
            matched = true;
            break;
          }
        }

        if (typeof sleep === 'function') await sleep(pollMs);
        else await new Promise(function (r) { setTimeout(r, pollMs); });
      }

      if (!matched) {
        throw new Error('asterFuturesWait: timeout after ' + timeoutMs + ' ms (or unknown state)');
      }

      if (row && typeof row === 'object') {
        var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
        if (keyVar && lastPayload != null) {
          try {
            row[keyVar] = JSON.stringify(lastPayload);
          } catch (_) {
            row[keyVar] = String(lastPayload);
          }
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
