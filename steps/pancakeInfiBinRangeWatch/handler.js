/**
 * PancakeSwap Infinity bin range watch handler.
 *
 * Polls the pool's active bin (via BinPoolManager getSlot0) vs the position bin range.
 * Step completes when activeId moves outside [lowerBinId, upperBinId].
 * Saves drift direction ('above' or 'below') for downstream runIf / runWorkflow branches.
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

  window.__CFS_registerStepHandler('pancakeInfiBinRangeWatch', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (pancakeInfiBinRangeWatch)');
    const { getRowValue, currentRow, sendMessage, sleep } = ctx;
    const row = currentRow || {};

    const infiPositionTokenId = resolveTemplate(String(action.infiPositionTokenId || '').trim(), row, getRowValue, action).trim();
    const poolId = resolveTemplate(String(action.poolId || '').trim(), row, getRowValue, action).trim();
    const infiLowerBinId = resolveTemplate(String(action.infiLowerBinId || '').trim(), row, getRowValue, action).trim();
    const infiUpperBinId = resolveTemplate(String(action.infiUpperBinId || '').trim(), row, getRowValue, action).trim();
    const tokenA = resolveTemplate(String(action.tokenA || '').trim(), row, getRowValue, action).trim();
    const tokenB = resolveTemplate(String(action.tokenB || '').trim(), row, getRowValue, action).trim();
    const infinityFee = resolveTemplate(String(action.infinityFee || '').trim(), row, getRowValue, action).trim();
    const binStep = resolveTemplate(String(action.binStep || '').trim(), row, getRowValue, action).trim();

    if (!infiPositionTokenId && !(infiLowerBinId && infiUpperBinId)) {
      throw new Error('PancakeSwap Infinity bin range watch: set infiPositionTokenId or infiLowerBinId + infiUpperBinId.');
    }
    if (!poolId && !infiPositionTokenId && !(tokenA && tokenB && infinityFee && binStep)) {
      throw new Error('PancakeSwap Infinity bin range watch: set poolId, infiPositionTokenId, or pool key fields (tokenA, tokenB, infinityFee, binStep).');
    }

    const pollIntervalMs = Math.max(5000, parseInt(action.pollIntervalMs, 10) || 30000);
    const timeoutMs = Math.max(0, parseInt(action.timeoutMs, 10) || 0);

    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      pollCount++;

      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        throw new Error('PancakeSwap Infinity bin range watch timed out after ' + Math.round(timeoutMs / 1000) + 's (' + pollCount + ' polls). Position is still in range.');
      }

      const payload = { type: 'CFS_BSC_INFI_BIN_RANGE_CHECK' };
      if (infiPositionTokenId) payload.infiPositionTokenId = infiPositionTokenId;
      if (poolId) payload.poolId = poolId;
      if (infiLowerBinId) payload.infiLowerBinId = infiLowerBinId;
      if (infiUpperBinId) payload.infiUpperBinId = infiUpperBinId;
      if (tokenA) payload.tokenA = tokenA;
      if (tokenB) payload.tokenB = tokenB;
      if (infinityFee) payload.infinityFee = infinityFee;
      if (binStep) payload.binStep = binStep;

      const response = await sendMessage(payload);

      if (!response || !response.ok) {
        const err = (response && response.error) || 'PancakeSwap Infinity bin range check failed';
        throw new Error(err);
      }

      const { activeId, lowerBinId, upperBinId, inRange, direction, poolId: resPoolId } = response;

      if (ctx.setStepProgress) {
        ctx.setStepProgress(
          'Bin ' + activeId + ' | Range [' + lowerBinId + ', ' + upperBinId + '] | ' +
          (inRange ? '✅ In range' : '❌ Out of range') +
          ' | Poll #' + pollCount
        );
      }

      if (!inRange) {
        const driftDir = direction || (activeId > upperBinId ? 'above' : 'below');

        if (row && typeof row === 'object') {
          const dirVar = String(action.saveDriftDirection || '').trim();
          if (dirVar) row[dirVar] = driftDir;

          const binVar = String(action.saveActiveBin || '').trim();
          if (binVar) row[binVar] = activeId;

          const rangeVar = String(action.savePositionRange || '').trim();
          if (rangeVar) {
            row[rangeVar] = JSON.stringify({
              lowerBinId,
              upperBinId,
              activeId,
              direction: driftDir,
              poolId: resPoolId || poolId || '',
              detectedAt: new Date().toISOString(),
              pollCount,
            });
          }
        }

        return;
      }

      await sleep(pollIntervalMs);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
