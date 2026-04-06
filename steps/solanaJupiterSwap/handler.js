/**
 * Jupiter swap step: automated swap via extension automation wallet (Settings → Solana).
 * Resolves {{var}} in mints, amount, RPC override. Sends CFS_SOLANA_EXECUTE_SWAP to background.
 */
(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  window.__CFS_registerStepHandler('solanaJupiterSwap', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaJupiterSwap)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let inputMint = resolveTemplate(String(action.inputMint || '').trim(), row, getRowValue, action).trim();
    let outputMint = resolveTemplate(String(action.outputMint || '').trim(), row, getRowValue, action).trim();
    let amountRaw = resolveTemplate(String(action.amountRaw != null ? action.amountRaw : '').trim(), row, getRowValue, action).trim();
    const slippageBps = Math.min(10000, Math.max(0, parseInt(action.slippageBps, 10) || 50));
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = String(action.rpcUrl || '').trim();
    rpcUrl = resolveTemplate(rpcUrl, row, getRowValue, action).trim();

    if (!inputMint || !outputMint || !amountRaw) {
      throw new Error('Solana Jupiter swap: set input mint, output mint, and raw amount (integer string in smallest units).');
    }

    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;
    const onlyDirectRoutes = action.onlyDirectRoutes === true;
    let jupiterDexes = resolveTemplate(String(action.jupiterDexes || '').trim(), row, getRowValue, action).trim();
    let jupiterExcludeDexes = resolveTemplate(String(action.jupiterExcludeDexes || '').trim(), row, getRowValue, action).trim();
    let jupPrio = resolveTemplate(String(action.jupiterPrioritizationFeeLamports != null ? action.jupiterPrioritizationFeeLamports : '').trim(), row, getRowValue, action).trim();

    const payload = {
      type: 'CFS_SOLANA_EXECUTE_SWAP',
      jupiterApiVersion: String(action.jupiterApiVersion || 'v2').trim(),
      jupiterSwapPath: String(action.jupiterSwapPath || 'order').trim(),
      inputMint,
      outputMint,
      amountRaw,
      slippageBps,
      cluster,
      rpcUrl: rpcUrl || undefined,
      skipSimulation,
      skipPreflight,
      onlyDirectRoutes,
      jupiterDexes: jupiterDexes || undefined,
      jupiterExcludeDexes: jupiterExcludeDexes || undefined,
    };
    if (jupPrio) payload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
    if (action.jupiterDynamicComputeUnitLimit === false) payload.jupiterDynamicComputeUnitLimit = false;
    if (action.jupiterWrapAndUnwrapSol === false) payload.jupiterWrapAndUnwrapSol = false;
    const crossBps = parseInt(action.jupiterCrossCheckMaxDeviationBps, 10);
    if (Number.isFinite(crossBps) && crossBps > 0) {
      payload.jupiterCrossCheckMaxDeviationBps = Math.min(10000, Math.max(0, crossBps));
    }
    if (action.jupiterCrossCheckOptional === true) payload.jupiterCrossCheckOptional = true;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Swap failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) {
        throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      }
      throw new Error(err);
    }

    if (row && typeof row === 'object') {
      const sigVar = String(action.saveSignatureVariable || '').trim();
      if (sigVar && response.signature) row[sigVar] = response.signature;
      const expVar = String(action.saveExplorerUrlVariable || '').trim();
      if (expVar && response.explorerUrl) row[expVar] = response.explorerUrl;
      const routerVar = String(action.saveRouterVariable || '').trim();
      if (routerVar && response.router) row[routerVar] = response.router;
      const outAmtVar = String(action.saveOutputAmountVariable || '').trim();
      if (outAmtVar && response.outputAmountResult) row[outAmtVar] = response.outputAmountResult;
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
