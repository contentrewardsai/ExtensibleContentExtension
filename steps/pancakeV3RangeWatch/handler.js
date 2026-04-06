/**
 * PancakeSwap V3 Range Watch handler.
 *
 * Polls the pool's current tick (via slot0) vs the position's tick range.
 * Step completes when the current tick moves outside the position range.
 * Saves drift direction ('above' or 'below') to a row variable for branching.
 *
 * Uses CFS_BSC_QUERY with operation=v3NpmPosition to read the position,
 * then derives the pool address via V3 factory.getPool, and reads slot0.
 * This is a single CFS_BSC_V3_RANGE_CHECK message that wraps both reads.
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

  window.__CFS_registerStepHandler('pancakeV3RangeWatch', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (pancakeV3RangeWatch)');
    const { getRowValue, currentRow, sendMessage, sleep } = ctx;
    const row = currentRow || {};

    const v3PositionTokenId = resolveTemplate(String(action.v3PositionTokenId || '').trim(), row, getRowValue, action).trim();
    if (!v3PositionTokenId) throw new Error('PancakeSwap V3 range watch: set v3PositionTokenId (V3 NFT token ID).');

    const pollIntervalMs = Math.max(5000, parseInt(action.pollIntervalMs, 10) || 30000);
    const timeoutMs = Math.max(0, parseInt(action.timeoutMs, 10) || 0);

    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      pollCount++;

      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        throw new Error('PancakeSwap V3 range watch timed out after ' + Math.round(timeoutMs / 1000) + 's (' + pollCount + ' polls). Position is still in range.');
      }

      const response = await sendMessage({
        type: 'CFS_BSC_V3_RANGE_CHECK',
        v3PositionTokenId,
      });

      if (!response || !response.ok) {
        const err = (response && response.error) || 'PancakeSwap V3 range check failed';
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
            pool: response.pool || '',
            token0: response.token0 || '',
            token1: response.token1 || '',
            fee: response.fee || '',
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
