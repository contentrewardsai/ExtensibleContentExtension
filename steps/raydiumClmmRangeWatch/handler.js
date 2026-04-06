/**
 * Raydium CLMM Range Watch handler.
 *
 * Polls the pool's current tick vs the position's tick range (tickLower/tickUpper).
 * Step completes when the current tick moves outside the position range.
 * Saves drift direction ('above' or 'below') to a row variable for branching.
 *
 * Uses CFS_RAYDIUM_CLMM_RANGE_CHECK message to the service worker.
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

  window.__CFS_registerStepHandler('raydiumClmmRangeWatch', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (raydiumClmmRangeWatch)');
    const { getRowValue, currentRow, sendMessage, sleep } = ctx;
    const row = currentRow || {};

    const poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    const positionNftMint = resolveTemplate(String(action.positionNftMint || '').trim(), row, getRowValue, action).trim();
    if (!poolId) throw new Error('Raydium CLMM range watch: set poolId (CLMM pool ID).');
    if (!positionNftMint) throw new Error('Raydium CLMM range watch: set positionNftMint (position NFT mint).');

    const pollIntervalMs = Math.max(5000, parseInt(action.pollIntervalMs, 10) || 30000);
    const timeoutMs = Math.max(0, parseInt(action.timeoutMs, 10) || 0);
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    const rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      pollCount++;

      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        throw new Error('Raydium CLMM range watch timed out after ' + Math.round(timeoutMs / 1000) + 's (' + pollCount + ' polls). Position is still in range.');
      }

      const response = await sendMessage({
        type: 'CFS_RAYDIUM_CLMM_RANGE_CHECK',
        poolId,
        positionNftMint,
        cluster,
        rpcUrl: rpcUrl || undefined,
      });

      if (!response || !response.ok) {
        const err = (response && response.error) || 'CLMM range check failed';
        throw new Error(err);
      }

      const { currentTick, tickLower, tickUpper, inRange } = response;

      if (ctx.setStepProgress) {
        ctx.setStepProgress(
          'Tick ' + currentTick + ' | Range [' + tickLower + ', ' + tickUpper + '] | ' +
          (inRange ? '✅ In range' : '❌ Out of range') +
          ' | Poll #' + pollCount
        );
      }

      if (!inRange) {
        const direction = currentTick > tickUpper ? 'above' : 'below';

        if (row && typeof row === 'object') {
          const dirVar = String(action.saveDriftDirection || '').trim();
          if (dirVar) row[dirVar] = direction;

          const tickVar = String(action.saveCurrentTick || '').trim();
          if (tickVar) row[tickVar] = currentTick;

          const rangeVar = String(action.savePositionRange || '').trim();
          if (rangeVar) row[rangeVar] = JSON.stringify({
            tickLower,
            tickUpper,
            currentTick,
            direction,
            detectedAt: new Date().toISOString(),
            pollCount,
          });
        }

        return;
      }

      await sleep(pollIntervalMs);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
