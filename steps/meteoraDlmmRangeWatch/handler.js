/**
 * Meteora DLMM Range Watch handler.
 *
 * Polls the pool's active bin vs the position's bin range.
 * Step completes (resolves) when active bin moves outside the position range.
 * Saves drift direction ('above' or 'below') to a row variable for branching.
 *
 * Uses CFS_METEORA_DLMM_RANGE_CHECK message to the service worker,
 * which in turn uses the Meteora DLMM SDK to read on-chain state.
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

  window.__CFS_registerStepHandler('meteoraDlmmRangeWatch', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (meteoraDlmmRangeWatch)');
    const { getRowValue, currentRow, sendMessage, sleep } = ctx;
    const row = currentRow || {};

    const lbPair = resolveTemplate(String(action.lbPair || '').trim(), row, getRowValue, action).trim();
    const position = resolveTemplate(String(action.position || '').trim(), row, getRowValue, action).trim();
    if (!lbPair) throw new Error('Meteora DLMM range watch: set lbPair (LB pool address).');
    if (!position) throw new Error('Meteora DLMM range watch: set position (DLMM position pubkey).');

    const pollIntervalMs = Math.max(5000, parseInt(action.pollIntervalMs, 10) || 30000);
    const timeoutMs = Math.max(0, parseInt(action.timeoutMs, 10) || 0);
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    const rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      pollCount++;

      // Check timeout
      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        throw new Error('Meteora DLMM range watch timed out after ' + Math.round(timeoutMs / 1000) + 's (' + pollCount + ' polls). Position is still in range.');
      }

      // Poll on-chain state
      const response = await sendMessage({
        type: 'CFS_METEORA_DLMM_RANGE_CHECK',
        lbPair,
        position,
        cluster,
        rpcUrl: rpcUrl || undefined,
      });

      if (!response || !response.ok) {
        const err = (response && response.error) || 'DLMM range check failed';
        throw new Error(err);
      }

      const { activeBinId, lowerBinId, upperBinId, inRange } = response;

      // Log progress (visible in playback UI)
      if (ctx.setStepProgress) {
        ctx.setStepProgress(
          'Bin ' + activeBinId + ' | Range [' + lowerBinId + ', ' + upperBinId + '] | ' +
          (inRange ? '✅ In range' : '❌ Out of range') +
          ' | Poll #' + pollCount
        );
      }

      if (!inRange) {
        // Price moved outside range — determine direction
        const direction = activeBinId > upperBinId ? 'above' : 'below';

        // Save to row variables
        if (row && typeof row === 'object') {
          const dirVar = String(action.saveDriftDirection || '').trim();
          if (dirVar) row[dirVar] = direction;

          const binVar = String(action.saveActiveBin || '').trim();
          if (binVar) row[binVar] = activeBinId;

          const rangeVar = String(action.savePositionRange || '').trim();
          if (rangeVar) row[rangeVar] = JSON.stringify({
            lowerBinId,
            upperBinId,
            activeBinId,
            direction,
            detectedAt: new Date().toISOString(),
            pollCount,
          });
        }

        // Step completes — downstream steps can react
        return;
      }

      // Still in range — wait and poll again
      await sleep(pollIntervalMs);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
