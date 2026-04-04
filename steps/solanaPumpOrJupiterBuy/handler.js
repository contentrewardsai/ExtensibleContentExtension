/**
 * Buy token with SOL: Pump.fun bonding curve if still active, otherwise Jupiter (WSOL -> mint).
 */
(function() {
  'use strict';

  const WSOL = 'So11111111111111111111111111111111111111112';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function setRowVar(row, varName, value) {
    const n = String(varName || '').trim();
    if (n && row && typeof row === 'object') row[n] = value != null ? String(value) : '';
  }

  function applyOptionalProbeRowVars(row, action, probe) {
    const complete = probe.bondingCurveComplete;
    const completeStr = complete === true ? 'true' : complete === false ? 'false' : 'unknown';
    const onCurve = probe.pumpBondingCurveReadable && complete === false ? 'true' : 'false';
    const ray = probe.raydiumPoolCheck || 'unknown';
    const rayFound = ray === 'found' ? 'true' : ray === 'not_found' ? 'false' : 'unknown';
    setRowVar(row, action.savePumpBondingCurveCompleteVariable, completeStr);
    setRowVar(row, action.savePumpOnBondingCurveVariable, onCurve);
    setRowVar(row, action.saveRaydiumPoolCheckVariable, ray);
    setRowVar(row, action.saveRaydiumSpotPoolFoundVariable, rayFound);
    setRowVar(row, action.saveRaydiumPoolCountVariable, String(probe.raydiumPoolCount != null ? probe.raydiumPoolCount : 0));
    if (probe.pumpProbeError) {
      setRowVar(row, action.savePumpProbeErrorVariable, probe.pumpProbeError);
    }
    if (probe.raydiumDetail) {
      setRowVar(row, action.saveRaydiumDetailVariable, probe.raydiumDetail);
    }
  }

  window.__CFS_registerStepHandler('solanaPumpOrJupiterBuy', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaPumpOrJupiterBuy)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    let solLamports = resolveTemplate(String(action.solLamports != null ? action.solLamports : '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const pumpSlippage = Math.max(0, parseInt(action.pumpSlippage, 10) || 1);
    const jupiterSlippageBps = Math.min(10000, Math.max(0, parseInt(action.jupiterSlippageBps, 10) || 50));
    const checkRaydium = action.checkRaydium !== false;
    let quoteMint = resolveTemplate(String(action.quoteMint || '').trim(), row, getRowValue, action).trim();
    if (!quoteMint) quoteMint = WSOL;

    const skipSimulation = action.skipSimulation === true;
    const skipPreflight = action.skipPreflight === true;
    const onlyDirectRoutes = action.onlyDirectRoutes === true;
    let jupiterDexes = resolveTemplate(String(action.jupiterDexes || '').trim(), row, getRowValue, action).trim();
    let jupiterExcludeDexes = resolveTemplate(String(action.jupiterExcludeDexes || '').trim(), row, getRowValue, action).trim();
    let jupPrio = resolveTemplate(String(action.jupiterPrioritizationFeeLamports != null ? action.jupiterPrioritizationFeeLamports : '').trim(), row, getRowValue, action).trim();

    if (!mint || !solLamports) {
      throw new Error('Pump or Jupiter buy: set mint and solLamports (lamports to spend).');
    }

    const probe = await sendMessage({
      type: 'CFS_PUMPFUN_MARKET_PROBE',
      mint,
      cluster,
      rpcUrl: rpcUrl || undefined,
      checkRaydium,
      quoteMint,
      raydiumPageSize: parseInt(action.raydiumPageSize, 10) || 20,
    });

    if (!probe || !probe.ok) {
      throw new Error((probe && probe.error) ? probe.error : 'Market probe failed');
    }

    let usePump = probe.pumpBondingCurveReadable === true && probe.bondingCurveComplete === false;
    if (usePump && action.requireRaydiumPoolForPump === true) {
      if (probe.raydiumPoolCheck !== 'found') {
        throw new Error(
          'requireRaydiumPoolForPump: Raydium spot pool not found for mint/quote (enable probe Raydium on mainnet). ' +
            'raydiumPoolCheck=' + String(probe.raydiumPoolCheck)
        );
      }
    }
    if (usePump && action.skipPumpIfRaydiumPoolFound === true && probe.raydiumPoolCheck === 'found') {
      usePump = false;
    }
    setRowVar(row, action.saveVenueVariable, usePump ? 'pump' : 'jupiter');
    applyOptionalProbeRowVars(row, action, probe);

    let response;
    if (usePump) {
      response = await sendMessage({
        type: 'CFS_PUMPFUN_BUY',
        mint,
        solLamports,
        slippage: pumpSlippage,
        cluster,
        rpcUrl: rpcUrl || undefined,
        skipSimulation,
        skipPreflight,
      });
    } else {
      const swapPayload = {
        type: 'CFS_SOLANA_EXECUTE_SWAP',
        inputMint: WSOL,
        outputMint: mint,
        amountRaw: solLamports,
        slippageBps: jupiterSlippageBps,
        cluster,
        rpcUrl: rpcUrl || undefined,
        skipSimulation,
        skipPreflight,
        onlyDirectRoutes,
        jupiterDexes: jupiterDexes || undefined,
        jupiterExcludeDexes: jupiterExcludeDexes || undefined,
      };
      if (jupPrio) swapPayload.jupiterPrioritizationFeeLamports = jupPrio === 'auto' ? 'auto' : jupPrio;
      if (action.jupiterDynamicComputeUnitLimit === false) swapPayload.jupiterDynamicComputeUnitLimit = false;
      if (action.jupiterWrapAndUnwrapSol === false) swapPayload.jupiterWrapAndUnwrapSol = false;
      response = await sendMessage(swapPayload);
    }

    if (!response || !response.ok) {
      const err = (response && response.error) ? response.error : 'Buy failed';
      const logs = response && response.simulationLogs;
      if (logs && logs.length) throw new Error(err + ' | logs: ' + logs.slice(0, 5).join(' ; '));
      throw new Error(err);
    }

    setRowVar(row, action.saveSignatureVariable, response.signature);
    setRowVar(row, action.saveExplorerUrlVariable, response.explorerUrl);
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
