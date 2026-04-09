/**
 * Simulate Swap handler — dry-run a DeFi swap on mainnet via simulation.
 *
 * Sends CFS_CRYPTO_TEST_SIMULATE to the service worker, which runs
 * simulateTransaction (Solana) or eth_call (BSC) — both free, no real tx.
 */
(function() {
  'use strict';
  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) { var v = getRowValue(row, key.trim()); return v != null ? String(v) : ''; });
      };

  window.__CFS_registerStepHandler('cryptoSimulateSwap', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (cryptoSimulateSwap)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};
    var r = function(f) { return resolveTemplate(String(action[f] != null ? action[f] : '').trim(), row, getRowValue, action).trim(); };

    var chain = r('chain') || 'solana';
    var runSolana = chain === 'solana' || chain === 'both';
    var runBsc = chain === 'bsc' || chain === 'both';

    var payload = {
      type: 'CFS_CRYPTO_TEST_SIMULATE',
      solana: runSolana,
      bsc: runBsc,
    };

    if (runSolana) {
      var solInput = r('solInputMint');
      var solOutput = r('solOutputMint');
      var solAmt = r('solAmount');
      if (solInput) payload.solInputMint = solInput;
      if (solOutput) payload.solOutputMint = solOutput;
      if (solAmt) payload.solAmount = solAmt;
    }

    if (runBsc) {
      var bscIn = r('bscTokenIn');
      var bscOut = r('bscTokenOut');
      var bscAmt = r('bscAmountIn');
      if (bscIn) payload.bscTokenIn = bscIn;
      if (bscOut) payload.bscTokenOut = bscOut;
      if (bscAmt) payload.bscAmountIn = bscAmt;
    }

    const response = await sendMessage(payload);
    if (!response) throw new Error('Simulation returned no response');

    var errors = [];
    if (runSolana && response.solana && !response.solana.ok) {
      errors.push('Solana: ' + (response.solana.error || 'unknown error'));
    }
    if (runBsc && response.bsc && !response.bsc.ok) {
      errors.push('BSC: ' + (response.bsc.error || 'unknown error'));
    }
    if (errors.length) throw new Error('Simulation failed — ' + errors.join('; '));

    if (row && typeof row === 'object') {
      var varName = String(action.saveResultVariable || '').trim();
      if (varName) {
        row[varName] = JSON.stringify({
          solana: response.solana || null,
          bsc: response.bsc || null,
        });
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
