/**
 * Always-on Following automation pipeline: resolve workflow-bound policy + run allowlisted headless steps
 * (Rugcheck, price drift, tx age) before solana-watch / bsc-watch execute swaps.
 */
(function (global) {
  'use strict';

  var WORKFLOWS_KEY = 'workflows';

  function normAddr(addr, chain) {
    var s = String(addr || '').trim();
    if (chain === 'evm' || chain === 'bsc') return s.toLowerCase();
    return s;
  }

  function bindMatches(action, entry, chain) {
    if (!action || action.type !== 'selectFollowingAccount') return false;
    var p = String(action.profileId || '').trim();
    var a = normAddr(action.address, chain);
    var entryChain = String(entry.chain || 'solana').toLowerCase();
    var wantChain = String(action.chain || 'solana').toLowerCase();
    if (wantChain === 'bsc' || wantChain === 'evm') wantChain = 'evm';
    if (entryChain === 'bsc') entryChain = 'evm';
    if (wantChain !== entryChain) return false;
    if (String(entry.profileId || '').trim() !== p) return false;
    return normAddr(entry.address, chain) === a;
  }

  function findBoundWorkflow(stored, entry, chain) {
    var key = chain === 'solana' ? 'followingAutomationSolana' : 'followingAutomationBsc';
    var wfs = stored[WORKFLOWS_KEY];
    if (!wfs || typeof wfs !== 'object' || Array.isArray(wfs)) return null;
    var ids = Object.keys(wfs);
    for (var i = 0; i < ids.length; i++) {
      var wf = wfs[ids[i]];
      if (!wf || !wf.alwaysOn || wf.alwaysOn.enabled !== true) continue;
      var sc = wf.alwaysOn.scopes || {};
      if (!sc[key]) continue;
      var actions = wf.analyzed && wf.analyzed.actions ? wf.analyzed.actions : [];
      for (var j = 0; j < actions.length; j++) {
        if (bindMatches(actions[j], entry, chain)) {
          return { workflowId: ids[i], workflow: wf };
        }
      }
    }
    return null;
  }

  function hasSelectFollowingStep(wf) {
    var actions = wf && wf.analyzed && wf.analyzed.actions ? wf.analyzed.actions : [];
    for (var i = 0; i < actions.length; i++) {
      if (actions[i].type === 'selectFollowingAccount') return true;
    }
    return false;
  }

  function mergeFollowingAutomationEntry(entry, wf) {
    var ct = wf.followingAutomation && typeof wf.followingAutomation === 'object' ? wf.followingAutomation : {};
    var automationEnabled =
      ct.automationEnabled === false
        ? false
        : ct.automationEnabled === true
          ? true
          : !!entry.automationEnabled;
    return Object.assign({}, entry, {
      automationEnabled: automationEnabled,
      sizeMode: ct.sizeMode != null ? ct.sizeMode : entry.sizeMode || 'off',
      autoExecuteSwaps: ct.autoExecuteSwaps === true,
      quoteMint: ct.quoteMint != null ? String(ct.quoteMint) : entry.quoteMint,
      fixedAmountRaw: ct.fixedAmountRaw != null ? String(ct.fixedAmountRaw) : entry.fixedAmountRaw,
      usdAmount: ct.usdAmount != null ? String(ct.usdAmount) : entry.usdAmount,
      proportionalScalePercent:
        ct.proportionalScalePercent != null ? ct.proportionalScalePercent : entry.proportionalScalePercent,
      slippageBps: ct.slippageBps != null ? ct.slippageBps : entry.slippageBps,
    });
  }

  /**
   * @returns {{ ok: boolean, mergedEntry?: object, globalOverrides?: object, workflow?: object, workflowId?: string, reason?: string }}
   */
  function resolveFollowingAutomationForWatch(stored, entry, chain) {
    var bound = findBoundWorkflow(stored, entry, chain);
    var g =
      stored.cfsFollowingAutomationGlobal && typeof stored.cfsFollowingAutomationGlobal === 'object'
        ? stored.cfsFollowingAutomationGlobal
        : {};

    if (!bound) {
      return {
        ok: true,
        legacy: true,
        mergedEntry: entry,
        globalOverrides: {
          paperMode: g.paperMode === true,
          jupiterWrapAndUnwrapSol: g.jupiterWrapAndUnwrapSol !== false,
        },
        workflow: null,
        workflowId: null,
      };
    }

    if (!hasSelectFollowingStep(bound.workflow)) {
      return { ok: false, reason: 'no_bind_step', workflowId: bound.workflowId };
    }

    var merged = mergeFollowingAutomationEntry(entry, bound.workflow);
    var ct =
      bound.workflow.followingAutomation && typeof bound.workflow.followingAutomation === 'object'
        ? bound.workflow.followingAutomation
        : {};
    return {
      ok: true,
      legacy: false,
      mergedEntry: merged,
      globalOverrides: {
        paperMode: ct.paperMode === true,
        jupiterWrapAndUnwrapSol: ct.jupiterWrapAndUnwrapSol !== false,
      },
      workflow: bound.workflow,
      workflowId: bound.workflowId,
    };
  }

  function nzDrift(x) {
    return x != null && Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null;
  }

  function resolveDriftMaxForSide(action, side) {
    var s = String(side || '').toLowerCase();
    var buy = nzDrift(action.maxDriftPercentBuy);
    var sell = nzDrift(action.maxDriftPercentSell);
    var both = nzDrift(action.maxDriftPercentBoth);
    if (s === 'buy') {
      if (buy != null) return buy;
      return both;
    }
    if (s === 'sell') {
      if (sell != null) return sell;
      return both;
    }
    return both;
  }

  function buildActivityRow(chain, entry, classification, sig, txHash) {
    var row = {
      kind: classification.kind,
      side: classification.side,
      quoteMint: classification.quoteMint,
      baseMint: classification.baseMint,
      targetPrice: classification.targetPrice,
      quoteSpentRaw: classification.quoteSpentRaw,
      baseSoldRaw: classification.baseSoldRaw,
      targetBlockTimeUnix: classification.targetBlockTimeUnix,
      signature: sig,
      pathStr: classification.pathStr,
      address: entry.address,
    };
    if (classification.venue) row.venue = classification.venue;
    if (classification.v3Path) row.v3Path = classification.v3Path;
    if (classification.quoteToken && !row.quoteMint) row.quoteMint = classification.quoteToken;
    if (classification.baseToken && !row.baseMint) row.baseMint = classification.baseToken;
    if (chain === 'bsc' || chain === 'evm') row.chain = 'bsc';
    if (txHash) row.txHash = txHash;
    return row;
  }

  function blockTimeUnixSec(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.targetBlockTimeUnix != null && Number.isFinite(Number(row.targetBlockTimeUnix))) {
      return Number(row.targetBlockTimeUnix);
    }
    if (row.timeStamp != null && String(row.timeStamp).trim() !== '') {
      var ts = parseInt(String(row.timeStamp).trim(), 10);
      if (Number.isFinite(ts) && ts > 0) return ts;
    }
    return null;
  }

  function fetchRugcheckReport(mint) {
    var u = 'https://api.rugcheck.xyz/v1/tokens/' + encodeURIComponent(mint) + '/report';
    var tiered = globalThis.__CFS_fetchGetTiered;
    var fetchFn = typeof tiered === 'function' ? tiered : fetch;
    return fetchFn(u, { method: 'GET' })
      .then(function (r) {
        if (!r.ok) throw new Error('rugcheck HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) {
        return { _error: e && e.message ? String(e.message) : String(e) };
      });
  }

  /**
   * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string }>}
   */
  function runFollowingAutomationHeadless(stored, wf, chain, mergedEntry, classification, sig, txHash) {
    var actions = wf && wf.analyzed && wf.analyzed.actions ? wf.analyzed.actions : [];
    var activityRow = buildActivityRow(chain, mergedEntry, classification, sig, txHash);
    var driftFn = globalThis.__CFS_watchActivityPriceDriftRow;

    function runIdx(i) {
      if (i >= actions.length) return Promise.resolve({ ok: true });
      var a = actions[i];
      var t = a && a.type;

      if (t === 'selectFollowingAccount' || t === 'loop' || t === 'runWorkflow') {
        return runIdx(i + 1);
      }

      if (t === 'rugcheckToken') {
        if (chain !== 'solana') return runIdx(i + 1);
        var mint = String(a.mint || a.mintTemplate || '').trim() || String(classification.baseMint || '').trim();
        if (!mint) {
          return Promise.resolve({ ok: false, skipped: true, reason: 'rugcheck_no_mint' });
        }
        var maxStr = String(a.maxScoreNormalised != null ? a.maxScoreNormalised : '').trim();
        var maxN = maxStr ? Number(maxStr) : null;
        return fetchRugcheckReport(mint).then(function (rep) {
          if (rep && rep._error) {
            if (a.failOnError === true) return { ok: false, skipped: true, reason: 'rugcheck_fetch_failed' };
            return runIdx(i + 1);
          }
          var sn = rep && rep.score_normalised != null ? Number(rep.score_normalised) : null;
          if (maxN != null && Number.isFinite(maxN) && sn != null && Number.isFinite(sn) && sn > maxN) {
            return { ok: false, skipped: true, reason: 'rugcheck_score_blocked' };
          }
          return runIdx(i + 1);
        });
      }

      if (t === 'watchActivityFilterPriceDrift') {
        if (typeof driftFn !== 'function') return runIdx(i + 1);
        var side = String(classification.side || '').toLowerCase();
        var maxP = resolveDriftMaxForSide(a, side);
        if (maxP == null) return runIdx(i + 1);
        var slip = a.slippageBps != null ? parseInt(String(a.slippageBps), 10) : mergedEntry.slippageBps != null ? mergedEntry.slippageBps : 50;
        if (!Number.isFinite(slip)) slip = 50;
        var amt = String(a.amountRaw || '').trim();
        return driftFn({
          row: activityRow,
          chain: chain === 'solana' ? 'solana' : 'bsc',
          amountRaw: amt,
          slippageBps: slip,
          maxDriftPercent: maxP,
        }).then(function (res) {
          if (!res || !res.ok) {
            return { ok: false, skipped: true, reason: 'drift_error' };
          }
          if (res.passed === false) {
            return { ok: false, skipped: true, reason: res.reason || 'drift_exceeded' };
          }
          return runIdx(i + 1);
        });
      }

      if (t === 'watchActivityFilterTxAge') {
        var maxSec = parseFloat(String(a.maxAgeSec || '').trim());
        if (!Number.isFinite(maxSec) || maxSec <= 0) return runIdx(i + 1);
        var passNoTime = a.passRowsWithoutBlockTime === true;
        var bt = blockTimeUnixSec(activityRow);
        if (bt == null) {
          if (passNoTime) return runIdx(i + 1);
          return { ok: false, skipped: true, reason: 'tx_age_no_block_time' };
        }
        var age = Date.now() / 1000 - bt;
        if (age > maxSec) {
          return { ok: false, skipped: true, reason: 'tx_age_exceeded' };
        }
        return runIdx(i + 1);
      }

      return runIdx(i + 1);
    }

    return runIdx(0);
  }

  global.__CFS_resolveFollowingAutomationForWatch = resolveFollowingAutomationForWatch;
  global.__CFS_runFollowingAutomationHeadless = runFollowingAutomationHeadless;
  /** Service worker + step playback: resilient GET to api.rugcheck.xyz (same as headless rugcheckToken). */
  global.__CFS_fetch_rugcheck_report = function (mint) {
    return fetchRugcheckReport(String(mint || '').trim());
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
