/**
 * Poll Aster spot: queryOrder status, or account balance threshold.
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

  function findSpotBalanceRow(balances, asset) {
    var a = String(asset || '').trim().toUpperCase();
    if (!a || !Array.isArray(balances)) return null;
    for (var i = 0; i < balances.length; i++) {
      if (String(balances[i].asset || '').toUpperCase() === a) return balances[i];
    }
    return null;
  }

  window.__CFS_registerStepHandler(
    'asterSpotWait',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterSpotWait)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var sleep = ctx.sleep;
      var assertPlaying = ctx.assertPlaying;
      var row = currentRow;

      var waitKind = trimResolved(row, getRowValue, action, action.waitKind) || 'order';
      var symbol = trimResolved(row, getRowValue, action, action.symbol);
      if (waitKind !== 'balance' && !symbol) throw new Error('asterSpotWait: symbol required (order wait)');

      var pollMs = Math.max(500, parseInt(action.pollIntervalMs, 10) || 2000);
      var timeoutMs = Math.max(1000, parseInt(action.waitTimeoutMs, 10) || 120000);
      var deadline = Date.now() + timeoutMs;
      var recvWindow = trimResolved(row, getRowValue, action, action.recvWindow);

      var targetStatuses = parseStatusSet(
        trimResolved(row, getRowValue, action, action.targetOrderStatus) || 'FILLED',
      );

      var oid = trimResolved(row, getRowValue, action, action.orderId);
      var oc = trimResolved(row, getRowValue, action, action.origClientOrderId);
      if (waitKind === 'order' && !oid && !oc) {
        throw new Error('asterSpotWait (order): orderId or origClientOrderId required');
      }

      var balAsset = trimResolved(row, getRowValue, action, action.balanceAsset);
      var balMode = trimResolved(row, getRowValue, action, action.balanceWaitMode) || 'freeAbove';
      var balThr = parseFloat(trimResolved(row, getRowValue, action, action.balanceThreshold));
      if (waitKind === 'balance') {
        if (!balAsset) throw new Error('asterSpotWait (balance): balanceAsset required');
        if (!Number.isFinite(balThr)) throw new Error('asterSpotWait (balance): balanceThreshold must be a number');
      }

      var lastPayload = null;
      var matched = false;

      while (Date.now() < deadline) {
        if (typeof assertPlaying === 'function') assertPlaying();

        if (waitKind === 'balance') {
          var ar = await sendMessage({
            type: 'CFS_ASTER_FUTURES',
            asterCategory: 'spotAccount',
            operation: 'account',
            recvWindow: recvWindow,
          });
          if (!ar || !ar.ok) {
            if (ar && ar.unknownState) {
              throw new Error((ar && ar.error) ? ar.error : 'account: unknown state (503)');
            }
            throw new Error((ar && ar.error) || 'spot account failed');
          }
          var bals = ar.result && ar.result.balances ? ar.result.balances : [];
          var brow = findSpotBalanceRow(bals, balAsset);
          var fr = brow ? parseFloat(brow.free) : 0;
          var lk = brow ? parseFloat(brow.locked) : 0;
          if (!Number.isFinite(fr)) fr = 0;
          if (!Number.isFinite(lk)) lk = 0;
          var tot = fr + lk;
          var okB = false;
          if (balMode === 'freeBelow') okB = fr < balThr;
          else if (balMode === 'totalAbove') okB = tot > balThr;
          else if (balMode === 'totalBelow') okB = tot < balThr;
          else okB = fr > balThr;
          lastPayload = { asset: balAsset, free: fr, locked: lk, total: tot, row: brow };
          if (okB) {
            matched = true;
            break;
          }
        } else {
          var qr = await sendMessage({
            type: 'CFS_ASTER_FUTURES',
            asterCategory: 'spotAccount',
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
            throw new Error((qr && qr.error) || 'spot queryOrder failed');
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
        throw new Error('asterSpotWait: timeout after ' + timeoutMs + ' ms');
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
