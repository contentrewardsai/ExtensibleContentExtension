/**
 * PancakeSwap V3 Range Watch handler.
 *
 * Default: poll until the current tick moves outside the position range.
 * waitUntilOutOfRange:false (always-on ticks / Plan debug): one check, succeed
 * even if still in range, and set inRange / driftDirection / triggerReason
 * (hard_oor | near_edge | in_range).
 *
 * SW ticks always one-shot regardless of this flag.
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

  function waitUntilOutOfRangeFromAction(action) {
    var helpers = typeof CFS_v3MonitorSteps !== 'undefined' ? CFS_v3MonitorSteps : null;
    if (helpers && typeof helpers.waitUntilOutOfRangeFromAction === 'function') {
      return helpers.waitUntilOutOfRangeFromAction(action);
    }
    var v = action && action.waitUntilOutOfRange;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  }

  function resolveNearPct(action, row) {
    var helpers = typeof CFS_v3MonitorSteps !== 'undefined' ? CFS_v3MonitorSteps : null;
    if (helpers && typeof helpers.resolveNearEdgePercent === 'function') {
      return helpers.resolveNearEdgePercent(action, row, null);
    }
    var raw = '';
    if (action && action.nearEdgePercent != null && String(action.nearEdgePercent).trim() !== '') {
      raw = action.nearEdgePercent;
    } else if (row && row.nearEdgePercent != null && String(row.nearEdgePercent).trim() !== '') {
      raw = row.nearEdgePercent;
    }
    var n = Number(String(raw || '').trim());
    if (!(n > 0) || !Number.isFinite(n)) return null;
    return n;
  }

  function classify(check, nearPct) {
    var helpers = typeof CFS_v3MonitorSteps !== 'undefined' ? CFS_v3MonitorSteps : null;
    if (helpers && typeof helpers.classifyTriggerFromCheck === 'function') {
      return helpers.classifyTriggerFromCheck(check, nearPct);
    }
    if (check.inRange === false) {
      var direction = check.currentTick > check.tickUpper ? 'above' : 'below';
      return { inRange: false, triggerReason: 'hard_oor', driftDirection: direction, nearEdge: false };
    }
    return { inRange: true, triggerReason: 'in_range', driftDirection: '', nearEdge: false };
  }

  function applyToRow(action, row, check, classified, pollCount) {
    var helpers = typeof CFS_v3MonitorSteps !== 'undefined' ? CFS_v3MonitorSteps : null;
    if (helpers && typeof helpers.applyRangeCheckToRow === 'function') {
      helpers.applyRangeCheckToRow(action, row, check, classified, { pollCount: pollCount });
      return;
    }
    var dirVar = String(action.saveDriftDirection || '').trim() || 'driftDirection';
    row[dirVar] = classified.driftDirection || '';
    row.driftDirection = classified.driftDirection || '';
    row.inRange = classified.inRange === true ? 'true' : 'false';
    row.triggerReason = classified.triggerReason || '';
    var tickVar = String(action.saveCurrentTick || '').trim();
    if (tickVar) row[tickVar] = check.currentTick;
    var rangeVar = String(action.savePositionRange || '').trim();
    if (rangeVar) {
      row[rangeVar] = JSON.stringify({
        tickLower: check.tickLower,
        tickUpper: check.tickUpper,
        currentTick: check.currentTick,
        direction: classified.driftDirection || '',
        triggerReason: classified.triggerReason || '',
        pool: check.pool || '',
        token0: check.token0 || '',
        token1: check.token1 || '',
        fee: check.fee || '',
        detectedAt: new Date().toISOString(),
        pollCount: pollCount,
      });
    }
  }

  window.__CFS_registerStepHandler('pancakeV3RangeWatch', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (pancakeV3RangeWatch)');
    const { getRowValue, currentRow, sendMessage, sleep } = ctx;
    const row = currentRow || {};

    const v3PositionTokenId = resolveTemplate(String(action.v3PositionTokenId || '').trim(), row, getRowValue, action).trim();
    if (!v3PositionTokenId) throw new Error('PancakeSwap V3 range watch: set v3PositionTokenId (V3 NFT token ID).');

    const pollIntervalMs = Math.max(5000, parseInt(action.pollIntervalMs, 10) || 30000);
    const timeoutMs = Math.max(0, parseInt(action.timeoutMs, 10) || 0);
    const waitUntil = waitUntilOutOfRangeFromAction(action);
    const nearPct = resolveNearPct(action, row);

    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      pollCount++;

      if (waitUntil && timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
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
      const classified = classify(response, nearPct);

      if (ctx.setStepProgress) {
        ctx.setStepProgress(
          'Tick ' + currentTick + ' | Range [' + tickLower + ', ' + tickUpper + '] | ' +
          (inRange ? (classified.nearEdge ? '⚠ Near edge' : '✅ In range') : '❌ Out of range') +
          ' | ' + (classified.triggerReason || '') +
          ' | Poll #' + pollCount
        );
      }

      if (!waitUntil) {
        if (row && typeof row === 'object') applyToRow(action, row, response, classified, pollCount);
        return;
      }

      if (!inRange) {
        if (row && typeof row === 'object') applyToRow(action, row, response, classified, pollCount);
        return;
      }

      await sleep(pollIntervalMs);
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false, swTick: true });
})();
