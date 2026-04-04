/**
 * Probe Pump.fun bonding curve + optional Raydium spot pools; writes row variables for runIf branching.
 */
(function() {
  'use strict';

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

  function setRowVar(row, action, key, value) {
    const name = String(action[key] || '').trim();
    if (name && row && typeof row === 'object') row[name] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('solanaPumpMarketProbe', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaPumpMarketProbe)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();
    const checkRaydium = action.checkRaydium !== false;
    let quoteMint = resolveTemplate(String(action.quoteMint || '').trim(), row, getRowValue, action).trim();
    if (!quoteMint) quoteMint = 'So11111111111111111111111111111111111111112';
    const raydiumPageSize = Math.min(100, Math.max(1, parseInt(action.raydiumPageSize, 10) || 20));

    if (!mint) throw new Error('Pump market probe: set token mint (base58).');

    const response = await sendMessage({
      type: 'CFS_PUMPFUN_MARKET_PROBE',
      mint,
      cluster,
      rpcUrl: rpcUrl || undefined,
      checkRaydium,
      quoteMint,
      raydiumPageSize,
    });

    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'Pump market probe failed');
    }

    const complete = response.bondingCurveComplete;
    const completeStr = complete === true ? 'true' : complete === false ? 'false' : 'unknown';
    const onCurve = response.pumpBondingCurveReadable && complete === false ? 'true' : 'false';
    const ray = response.raydiumPoolCheck || 'unknown';
    const rayFound = ray === 'found' ? 'true' : ray === 'not_found' ? 'false' : 'unknown';

    setRowVar(row, action, 'savePumpBondingCurveCompleteVariable', completeStr);
    setRowVar(row, action, 'savePumpOnBondingCurveVariable', onCurve);
    setRowVar(row, action, 'saveRaydiumPoolCheckVariable', ray);
    setRowVar(row, action, 'saveRaydiumSpotPoolFoundVariable', rayFound);
    setRowVar(row, action, 'saveRaydiumPoolCountVariable', String(response.raydiumPoolCount != null ? response.raydiumPoolCount : 0));
    if (response.pumpProbeError) {
      setRowVar(row, action, 'savePumpProbeErrorVariable', response.pumpProbeError);
    }
    if (response.raydiumDetail) {
      setRowVar(row, action, 'saveRaydiumDetailVariable', response.raydiumDetail);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
