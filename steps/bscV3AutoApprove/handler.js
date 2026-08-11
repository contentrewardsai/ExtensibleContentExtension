/**
 * Approve tokenA and tokenB for PancakeSwap V3 SwapRouter + NPM when allowance is insufficient.
 */
(function() {
  'use strict';

  var SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
  var NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  var MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  var ALLOWANCE_SKIP_THRESHOLD = '1000000000000000000000000000000';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  function allowanceSufficient(allowanceStr) {
    if (!allowanceStr) return false;
    try {
      var a = BigInt(allowanceStr);
      if (a >= BigInt(MAX_UINT256)) return true;
      if (a >= BigInt(ALLOWANCE_SKIP_THRESHOLD)) return true;
    } catch (_) {
      return false;
    }
    return false;
  }

  async function bscQuery(sendMessage, payload) {
    var response = await sendMessage(Object.assign({ type: 'CFS_BSC_QUERY' }, payload));
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC query failed: ' + payload.operation);
    }
    return response.result || {};
  }

  async function bscExecute(sendMessage, payload) {
    var response = await sendMessage(Object.assign({ type: 'CFS_BSC_POOL_EXECUTE' }, payload));
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'BSC execute failed: ' + payload.operation);
    }
    return response;
  }

  window.__CFS_registerStepHandler('bscV3AutoApprove', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bscV3AutoApprove)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var tokenA = trimResolved(row, getRowValue, action, action.tokenA);
    var tokenB = trimResolved(row, getRowValue, action, action.tokenB);
    if (!tokenA || !tokenB) throw new Error('bscV3AutoApprove: set tokenA and tokenB.');

    var router = trimResolved(row, getRowValue, action, action.swapRouterV3Address) || SWAP_ROUTER_V3;
    var npm = trimResolved(row, getRowValue, action, action.positionManagerAddress) || NPM_V3;
    var amount = trimResolved(row, getRowValue, action, action.amount) || 'max';
    var gasLimit = trimResolved(row, getRowValue, action, action.gasLimit);

    await bscQuery(sendMessage, { operation: 'automationWalletAddress' });

    var tokens = [tokenA, tokenB];
    var spenders = [router, npm];
    var results = [];

    for (var ti = 0; ti < tokens.length; ti++) {
      var tok = tokens[ti];
      for (var si = 0; si < spenders.length; si++) {
        var spender = spenders[si];
        var alw = await bscQuery(sendMessage, {
          operation: 'allowance',
          token: tok,
          spender: spender,
        });
        var entry = { token: tok, spender: spender, skipped: false };
        if (allowanceSufficient(alw.allowance)) {
          entry.skipped = true;
          entry.reason = 'sufficient_allowance';
          results.push(entry);
          continue;
        }
        var execPayload = {
          operation: 'approve',
          token: tok,
          spender: spender,
          amount: amount,
        };
        if (gasLimit) execPayload.gasLimit = gasLimit;
        var execRes = await bscExecute(sendMessage, execPayload);
        entry.skipped = false;
        entry.txHash = execRes.txHash || '';
        entry.explorerUrl = execRes.explorerUrl || '';
        results.push(entry);
      }
    }

    if (row && typeof row === 'object') {
      var saveVar = trimResolved(row, getRowValue, action, action.saveApproveResultsVariable) || 'v3ApproveResults';
      try {
        row[saveVar] = JSON.stringify(results);
      } catch (_) {
        row[saveVar] = '[]';
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
