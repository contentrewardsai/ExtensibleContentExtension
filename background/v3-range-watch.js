/**
 * Pancake V3 concentrated LP range watch (MV3 service worker).
 *
 * Multi-position: alwaysOn.boundRows[] (legacy boundRow migrates on read).
 * Batch checks via __CFS_bsc_v3_range_check_batch. Idle when 0 NFTs (no RPC).
 */
(function (global) {
  'use strict';

  var ALARM_NAME = 'cfs_v3_range_poll';
  var LAST_POLL_KEY = 'cfsV3RangeWatchLastPoll';
  var JOBS_KEY = 'cfsV3RangeWatchJobs';
  var WORKFLOWS_KEY = 'workflows';
  var STOP_KEY = 'cfsV3RangeWatchStop';
  var DEFAULT_POLL_MS = 30000;
  var MIN_POLL_MS = 5000;
  var RECONCILE_EVERY_N = 10;
  var ACTIVITY_KEY = 'cfsAlwaysOnActivityLog';
  var tickCountByWf = Object.create(null);

  var cs = globalThis.CFS_CRYPTO_STORAGE;
  var storageLocalGet = cs.storageLocalGet;
  var storageLocalSet = cs.storageLocalSet;
  var BP = globalThis.CFS_ALWAYS_ON_BOUND_POSITIONS || globalThis.__CFS_alwaysOnBoundPositions || null;

  var inFlightByJobKey = Object.create(null);

  async function appendActivity(entry) {
    try {
      var cur = (await storageLocalGet([ACTIVITY_KEY]))[ACTIVITY_KEY];
      var list = Array.isArray(cur) ? cur.slice() : [];
      list.unshift(Object.assign({ ts: Date.now(), family: 'v3' }, entry || {}));
      if (list.length > 50) list = list.slice(0, 50);
      await storageLocalSet({ [ACTIVITY_KEY]: list });
    } catch (_) {}
  }

  function getRowValue(row, key) {
    if (!row || key == null) return undefined;
    var k = String(key).trim();
    if (!k) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
    return undefined;
  }

  function resolveTemplateString(str, row) {
    if (str == null) return '';
    var s = String(str);
    return s.replace(/\{\{([^}]+)\}\}/g, function (_, inner) {
      var k = inner.trim();
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  function resolveTemplatesDeep(val, row) {
    if (val == null) return val;
    if (typeof val === 'string') return resolveTemplateString(val, row);
    if (Array.isArray(val)) return val.map(function (x) { return resolveTemplatesDeep(x, row); });
    if (typeof val === 'object') {
      var out = {};
      var keys = Object.keys(val);
      for (var i = 0; i < keys.length; i++) {
        out[keys[i]] = resolveTemplatesDeep(val[keys[i]], row);
      }
      return out;
    }
    return val;
  }

  function evaluateRunIf(runIfRaw, row) {
    var ric = global.CFS_runIfCondition;
    if (!ric || typeof ric.evaluate !== 'function') {
      return !!String(runIfRaw || '').trim();
    }
    if (!String(runIfRaw || '').trim()) return true;
    return ric.evaluate(runIfRaw, row, getRowValue);
  }

  function applyRowMapping(parentRow, mapping) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      return Object.assign({}, parentRow || {});
    }
    var child = {};
    var keys = Object.keys(mapping);
    for (var i = 0; i < keys.length; i++) {
      var parentKey = keys[i];
      var childKey = mapping[parentKey];
      if (childKey == null || String(childKey).trim() === '') continue;
      child[String(childKey).trim()] = getRowValue(parentRow, parentKey);
    }
    return Object.assign({}, parentRow || {}, child);
  }

  function isV3PriceRangeWatch(prw) {
    if (!prw || typeof prw !== 'object') return false;
    var mode = String(prw.mode || prw.watchMode || '').toLowerCase();
    if (mode === 'v3' || mode === 'pancake_v3') return true;
    if (mode === 'infi' || mode === 'infinity') return false;
    var tid = prw.v3PositionTokenId != null ? String(prw.v3PositionTokenId).trim() : '';
    return !!tid;
  }

  function jobKeyFor(wfId, tokenId, pool) {
    return wfId + '|v3|' + String(tokenId || '') + '|' + String(pool || '');
  }

  function normalizePollMs(raw) {
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_MS;
    return Math.max(MIN_POLL_MS, n);
  }

  function boundPositionsApi() {
    return BP || globalThis.CFS_ALWAYS_ON_BOUND_POSITIONS || globalThis.__CFS_alwaysOnBoundPositions || null;
  }

  function collectV3MonitorWorkflows(stored) {
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return [];
    var ids = Object.keys(w);
    var jobs = [];
    var api = boundPositionsApi();
    for (var i = 0; i < ids.length; i++) {
      var wfId = ids[i];
      var wf = w[wfId];
      if (!wf || !wf.alwaysOn || wf.alwaysOn.enabled !== true) continue;
      var sc = (wf.alwaysOn && wf.alwaysOn.scopes) || {};
      if (!sc.priceRangeWatch) continue;
      var prw = wf.alwaysOn.priceRangeWatch;
      if (!isV3PriceRangeWatch(prw)) continue;
      var positions = api
        ? api.activeWatchPositions(wf.alwaysOn, 'v3')
        : (wf.alwaysOn.boundRow && wf.alwaysOn.boundRow.v3PositionTokenId
          ? [wf.alwaysOn.boundRow]
          : []);
      jobs.push({
        workflowId: wfId,
        workflowName: wf.name || wfId,
        pollIntervalMs: normalizePollMs(wf.alwaysOn.pollIntervalMs || (prw && prw.pollIntervalMs) || DEFAULT_POLL_MS),
        positions: positions,
        priceRangeWatch: prw,
        runAllMatches: prw && prw.runAllMatches === true,
        alwaysOn: wf.alwaysOn,
      });
    }
    return jobs;
  }

  function recordPoll(fields) {
    var payload = Object.assign({ ts: Date.now() }, fields);
    return storageLocalSet({ [LAST_POLL_KEY]: payload }).catch(function () {});
  }

  function scheduleNextAlarm(pollIntervalMs) {
    var when = Date.now() + normalizePollMs(pollIntervalMs);
    try {
      chrome.alarms.create(ALARM_NAME, { when: when });
    } catch (_) {}
  }

  async function maybeEnsureGas(alwaysOn) {
    var ao = alwaysOn || {};
    if (ao.gasReloadEnabled !== true && ao.gasReloadEnabled !== 'true') return null;
    var fn = global.__CFS_bsc_ensure_native_gas_from_stable;
    if (typeof fn !== 'function') return null;
    try {
      var out = await fn({
        gasReloadBelowWei: ao.gasReloadBelowWei,
        gasReloadTargetWei: ao.gasReloadTargetWei,
        gasReloadStableToken: ao.gasReloadStableToken || ao.stableToken,
        stableReserveWei: ao.stableReserveWei || ao.gasReloadStableReserveWei,
      });
      if (out && out.ok && !out.skipped) {
        await appendActivity({
          kind: 'gas_topup',
          balanceBeforeWei: out.balanceBeforeWei,
          balanceAfterWei: out.balanceAfterWei,
          txHash: out.txHash,
        });
      }
      return out;
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  async function removeClosedFromWorkflow(stored, workflowId, tokenIds) {
    var api = boundPositionsApi();
    if (!api || !tokenIds || !tokenIds.length) return { removed: [] };
    var wfs = stored[WORKFLOWS_KEY];
    if (!wfs || !wfs[workflowId] || !wfs[workflowId].alwaysOn) return { removed: [] };
    var ao = wfs[workflowId].alwaysOn;
    var removed = [];
    for (var i = 0; i < tokenIds.length; i++) {
      var tid = tokenIds[i];
      var out = api.removeBoundPosition(ao, tid, 'v3');
      if (out && out.removed) {
        removed.push(tid);
        await appendActivity({ kind: 'removed_burned_nft', tokenId: tid, workflowId: workflowId });
      }
    }
    api.syncPrimaryBoundRow(ao, 'v3');
    if (removed.length) await storageLocalSet({ workflows: wfs });
    return { removed: removed };
  }

  /** True burned/closed: zero liquidity after a successful decode. Soft missing (wrong RPC/chain) must not drop binds. */
  function isHardClosedCheck(check) {
    if (!check) return false;
    if (check.ok && check.zeroLiquidity) return true;
    if (!check.ok && check.zeroLiquidity) return true;
    return false;
  }

  function resolveNearEdgePercent(positionRow, alwaysOn) {
    var raw = '';
    if (positionRow && positionRow.nearEdgePercent != null && String(positionRow.nearEdgePercent).trim() !== '') {
      raw = positionRow.nearEdgePercent;
    } else if (alwaysOn && alwaysOn.nearEdgePercent != null && String(alwaysOn.nearEdgePercent).trim() !== '') {
      raw = alwaysOn.nearEdgePercent;
    }
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    var n = Number(s);
    if (!(n > 0) || !Number.isFinite(n)) return null;
    return n;
  }

  /**
   * opts: { triggerReason?: 'hard_oor'|'near_edge', driftDirection?: 'below'|'above' }
   */
  async function triggerOutOfRange(stored, job, positionRow, check, prwTemplate, opts) {
    var o = opts || {};
    var prwResolved = resolveTemplatesDeep(prwTemplate || job.priceRangeWatch, positionRow);
    var direction =
      o.driftDirection === 'above' || o.driftDirection === 'below'
        ? o.driftDirection
        : check.driftDirection === 'above' || check.driftDirection === 'below'
          ? check.driftDirection
          : check.currentTick > check.tickUpper
            ? 'above'
            : 'below';
    var triggerReason = o.triggerReason || (check.inRange === false ? 'hard_oor' : 'near_edge');
    var triggerRow = Object.assign({}, positionRow || {}, {
      driftDirection: direction,
      triggerReason: triggerReason,
      currentTick: check.currentTick,
      tickLower: check.tickLower,
      tickUpper: check.tickUpper,
      pctToLower: check.pctToLower != null ? String(check.pctToLower) : '',
      pctToUpper: check.pctToUpper != null ? String(check.pctToUpper) : '',
      composition0: check.composition0 != null ? String(check.composition0) : '',
      composition1: check.composition1 != null ? String(check.composition1) : '',
      v3Pool: check.pool || positionRow.v3Pool || '',
      token0: check.token0 || positionRow.token0 || '',
      token1: check.token1 || positionRow.token1 || '',
      v3Fee: check.fee || positionRow.v3Fee || '',
      v3PositionTokenId: check.v3PositionTokenId || positionRow.v3PositionTokenId || '',
      inRange: false,
      inactive: triggerReason === 'hard_oor',
      detectedAt: new Date().toISOString(),
      exitBelowPolicy: positionRow.exitBelowPolicy || prwResolved.exitBelowPolicy || '',
      exitAbovePolicy: positionRow.exitAbovePolicy || prwResolved.exitAbovePolicy || '',
      stableToken: positionRow.stableToken || prwResolved.stableToken || '',
      rangePercent: positionRow.rangePercent || prwResolved.rangePercent || '1',
      rangePercentBelow: positionRow.rangePercentBelow || '',
      rangePercentAbove: positionRow.rangePercentAbove || '',
      nearEdgePercent: positionRow.nearEdgePercent || (job.alwaysOn && job.alwaysOn.nearEdgePercent) || '',
      fundMode: positionRow.fundMode || 'stable',
    });

    var rules = Array.isArray(prwResolved.onOutOfRange) ? prwResolved.onOutOfRange : [];
    var workflows = stored[WORKFLOWS_KEY] || {};
    var execFn = global.__CFS_executeBackgroundWorkflow;
    if (typeof execFn !== 'function') {
      return { ok: false, error: 'background workflow runner not loaded', triggered: [] };
    }

    var triggered = [];
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (!rule || !rule.workflowId) continue;
      if (!evaluateRunIf(rule.runIf, triggerRow)) continue;

      var childRow = applyRowMapping(triggerRow, rule.rowMapping);
      var startUrl = (prwResolved.playbackStartUrl && String(prwResolved.playbackStartUrl).trim()) ||
        (rule.playbackStartUrl && String(rule.playbackStartUrl).trim()) ||
        '';
      var entry = {
        workflowId: String(rule.workflowId).trim(),
        row: childRow,
        type: 'v3_range_trigger',
        overrideStartUrl: startUrl || undefined,
        startStepIndex: rule.startStepIndex != null ? rule.startStepIndex : undefined,
        activeTab: false,
      };

      var jk = jobKeyFor(job.workflowId, triggerRow.v3PositionTokenId, triggerRow.v3Pool);
      if (inFlightByJobKey[jk]) {
        return { ok: true, skipped: true, reason: 'in_flight', triggered: triggered };
      }
      inFlightByJobKey[jk] = true;
      try {
        var hist = await execFn(entry, workflows);
        triggered.push({
          workflowId: entry.workflowId,
          v3PositionTokenId: triggerRow.v3PositionTokenId,
          status: hist && hist.status,
          error: hist && hist.error,
          triggerReason: triggerReason,
          driftDirection: direction,
        });
        await appendActivity({
          kind: triggerReason === 'near_edge' ? 'near_edge_trigger' : 'oor_trigger',
          tokenId: triggerRow.v3PositionTokenId,
          workflowId: job.workflowId,
          childWorkflowId: entry.workflowId,
          driftDirection: direction,
          triggerReason: triggerReason,
          status: hist && hist.status,
          error: hist && hist.error,
        });
      } finally {
        delete inFlightByJobKey[jk];
      }

      if (!job.runAllMatches) break;
    }
    return { ok: true, triggered: triggered, triggerReason: triggerReason, driftDirection: direction };
  }

  async function pollWorkflowPositions(stored, job) {
    var positions = job.positions || [];
    if (!positions.length) {
      return { ok: true, idle: true, reason: 'no_v3_positions', workflowId: job.workflowId, results: [] };
    }

    var batchFn = global.__CFS_bsc_v3_range_check_batch;
    if (typeof batchFn !== 'function') {
      return { ok: false, error: 'V3 batch range check not loaded', workflowId: job.workflowId };
    }

    var gasInfo = await maybeEnsureGas(job.alwaysOn);

    var batch = await batchFn({
      positions: positions.map(function (p) {
        return { v3PositionTokenId: p.v3PositionTokenId, v3Pool: p.v3Pool };
      }),
    });
    var checks = (batch && batch.results) || [];
    var byId = Object.create(null);
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      if (c && c.v3PositionTokenId) byId[String(c.v3PositionTokenId)] = c;
    }

    var closedIds = [];
    var results = [];
    var triggeredAll = [];

    for (var pi = 0; pi < positions.length; pi++) {
      var prow = positions[pi];
      var tid = String(prow.v3PositionTokenId || '').trim();
      var check = byId[tid];
      if (!check) {
        results.push({ ok: false, v3PositionTokenId: tid, error: 'no check result' });
        continue;
      }
      if (isHardClosedCheck(check)) {
        closedIds.push(tid);
        results.push({
          ok: true,
          v3PositionTokenId: tid,
          closed: true,
          error: check.error,
          check: check,
        });
        continue;
      }
      if (!check.ok) {
        // missing / RPC / wrong-chain: keep bind; reconcile drops only when owner enumeration confirms gone
        results.push({
          ok: false,
          v3PositionTokenId: tid,
          error: check.error,
          check: check,
          softMissing: !!check.missing,
        });
        continue;
      }
      if (check.inRange) {
        var nearPct = resolveNearEdgePercent(prow, job.alwaysOn);
        var nearLower =
          nearPct != null && check.pctToLower != null && Number(check.pctToLower) <= nearPct;
        var nearUpper =
          nearPct != null && check.pctToUpper != null && Number(check.pctToUpper) <= nearPct;
        if (nearLower || nearUpper) {
          var softDir =
            nearLower && nearUpper
              ? Number(check.pctToLower) <= Number(check.pctToUpper)
                ? 'below'
                : 'above'
              : nearLower
                ? 'below'
                : 'above';
          var softTrig = await triggerOutOfRange(stored, job, prow, check, job.priceRangeWatch, {
            triggerReason: 'near_edge',
            driftDirection: softDir,
          });
          results.push({
            ok: true,
            inRange: true,
            nearEdge: true,
            v3PositionTokenId: tid,
            check: check,
            triggered: softTrig.triggered || [],
            skipped: softTrig.skipped,
            triggerReason: 'near_edge',
            driftDirection: softDir,
          });
          if (softTrig.triggered) triggeredAll = triggeredAll.concat(softTrig.triggered);
          continue;
        }
        results.push({ ok: true, inRange: true, v3PositionTokenId: tid, check: check });
        continue;
      }
      var trig = await triggerOutOfRange(stored, job, prow, check, job.priceRangeWatch, {
        triggerReason: 'hard_oor',
        driftDirection: check.driftDirection || (check.currentTick > check.tickUpper ? 'above' : 'below'),
      });
      results.push({
        ok: true,
        inRange: false,
        inactive: true,
        v3PositionTokenId: tid,
        check: check,
        triggered: trig.triggered || [],
        skipped: trig.skipped,
        triggerReason: 'hard_oor',
        driftDirection: trig.driftDirection,
      });
      if (trig.triggered) triggeredAll = triggeredAll.concat(trig.triggered);
    }

    if (closedIds.length) {
      await removeClosedFromWorkflow(stored, job.workflowId, closedIds);
    }

    // Periodic reconcile discover (every N ticks)
    tickCountByWf[job.workflowId] = (tickCountByWf[job.workflowId] || 0) + 1;
    var reconcileNote = null;
    if (tickCountByWf[job.workflowId] % RECONCILE_EVERY_N === 0) {
      try {
        reconcileNote = await reconcileWorkflow(stored, job);
      } catch (eR) {
        reconcileNote = { ok: false, error: (eR && eR.message) || String(eR) };
      }
    }

    return {
      ok: true,
      workflowId: job.workflowId,
      results: results,
      triggered: triggeredAll,
      closedRemoved: closedIds,
      gasTopUp: gasInfo,
      reconcile: reconcileNote,
    };
  }

  async function reconcileWorkflow(stored, job) {
    var api = boundPositionsApi();
    var discover = global.__CFS_bsc_v3_npm_positions_by_owner;
    if (!api || typeof discover !== 'function') return { ok: false, error: 'reconcile helpers missing' };
    var disc = await discover({});
    if (!disc || disc.ok === false) {
      return { ok: false, error: (disc && disc.error) || 'v3NpmPositionsByOwner failed' };
    }
    var discChain = disc.result && disc.result.chainId != null ? Number(disc.result.chainId) : 0;
    // Pancake V3 NPM pins are mainnet; Chapel/wrong chain would report balance 0 and falsely "close" all.
    if (discChain && discChain !== 56) {
      return {
        ok: false,
        error:
          'Reconcile skipped: need BSC mainnet chainId 56 (got ' +
          discChain +
          '). Set Settings → BSC RPC to a mainnet endpoint.',
        chainId: discChain,
        rpcHost: disc.result && disc.result.rpcHost,
      };
    }
    // Prefer owner enumeration. Soft-missing batch rows still count as held by the wallet.
    var rawPositions = (disc.result && disc.result.positions) || [];
    var enumIds = Array.isArray(disc.result.tokenIds) ? disc.result.tokenIds : [];
    var onChain = [];
    var seen = Object.create(null);
    for (var oi = 0; oi < rawPositions.length; oi++) {
      var rp = rawPositions[oi] || {};
      var rid = String(rp.v3PositionTokenId || rp.tokenId || '').trim();
      if (!rid) continue;
      seen[rid] = true;
      if (rp.ok === false && rp.missing) {
        onChain.push(Object.assign({}, rp, { v3PositionTokenId: rid, liquidity: '1' }));
        continue;
      }
      onChain.push(Object.assign({}, rp, { v3PositionTokenId: rid }));
    }
    for (var ei = 0; ei < enumIds.length; ei++) {
      var eid = String(enumIds[ei] || '').trim();
      if (!eid || seen[eid]) continue;
      onChain.push({ v3PositionTokenId: eid, liquidity: '1', enumeratedOnly: true });
    }
    var bound = api.normalizeBoundPositions(job.alwaysOn, 'v3');
    var diff = api.reconcilePositions(bound, onChain, 'v3');
    if (diff.closed && diff.closed.length) {
      var ids = diff.closed.map(function (r) { return api.positionIdKey('v3', r); });
      await removeClosedFromWorkflow(stored, job.workflowId, ids);
    }
    var autoTrack = job.alwaysOn && (job.alwaysOn.reconcileAutoTrackNew === true || job.alwaysOn.reconcileAutoTrackNew === 'true');
    if (autoTrack && diff.untracked && diff.untracked.length) {
      var wfs = stored[WORKFLOWS_KEY];
      var ao = wfs[job.workflowId].alwaysOn;
      var primary = bound[0] || {};
      for (var u = 0; u < diff.untracked.length; u++) {
        var up = diff.untracked[u];
        api.upsertBoundPosition(ao, {
          v3PositionTokenId: up.v3PositionTokenId,
          v3Pool: up.pool || '',
          token0: up.token0 || '',
          token1: up.token1 || '',
          v3Fee: up.fee || '',
          tickLower: up.tickLower != null ? String(up.tickLower) : '',
          tickUpper: up.tickUpper != null ? String(up.tickUpper) : '',
          exitBelowPolicy: primary.exitBelowPolicy || 'sell_stable',
          exitAbovePolicy: primary.exitAbovePolicy || 'restake',
          stableToken: primary.stableToken || '0x55d398326f99059fF775485246999027B3197955',
          rangePercentBelow: primary.rangePercentBelow || '',
          rangePercentAbove: primary.rangePercentAbove || '',
          rangePercent: primary.rangePercent || '0.5',
          fundMode: primary.fundMode || 'stable',
          enabled: true,
        }, 'v3');
      }
      await storageLocalSet({ workflows: wfs });
    }
    return {
      ok: true,
      untrackedCount: (diff.untracked || []).length,
      closedCount: (diff.closed || []).length,
      untracked: (diff.untracked || []).map(function (p) { return p.v3PositionTokenId; }),
      autoTracked: !!autoTrack,
    };
  }

  async function tick() {
    var minPoll = DEFAULT_POLL_MS;
    try {
      var stored = await storageLocalGet([WORKFLOWS_KEY, STOP_KEY, JOBS_KEY]);
      var stop = stored[STOP_KEY];
      if (stop && stop.global === true) {
        await recordPoll({ ok: true, idle: true, reason: 'globally_stopped' });
        scheduleNextAlarm(DEFAULT_POLL_MS);
        return;
      }

      var evalFn = global.__CFS_evaluateAlwaysOnAutomation || global.__CFS_evaluateFollowingAutomation;
      if (typeof evalFn === 'function') {
        var gate = evalFn(stored);
        if (!gate.allowPriceRangeWatch) {
          await recordPoll({ ok: true, idle: true, reason: 'price_range_watch_not_enabled' });
          scheduleNextAlarm(DEFAULT_POLL_MS);
          return;
        }
      }

      var jobs = collectV3MonitorWorkflows(stored);
      if (jobs.length === 0) {
        await recordPoll({ ok: true, idle: true, reason: 'no_v3_price_range_jobs' });
        scheduleNextAlarm(DEFAULT_POLL_MS);
        return;
      }

      var totalPositions = 0;
      for (var mi = 0; mi < jobs.length; mi++) {
        minPoll = Math.min(minPoll, normalizePollMs(jobs[mi].pollIntervalMs));
        totalPositions += (jobs[mi].positions || []).length;
      }

      if (totalPositions === 0) {
        await recordPoll({
          ok: true,
          idle: true,
          reason: 'no_v3_positions',
          jobCount: jobs.length,
          positionCount: 0,
        });
        await storageLocalSet({
          [JOBS_KEY]: jobs.map(function (j) {
            return { workflowId: j.workflowId, workflowName: j.workflowName, positionCount: 0 };
          }),
        });
        scheduleNextAlarm(minPoll);
        return;
      }

      var results = [];
      for (var ji = 0; ji < jobs.length; ji++) {
        var job = jobs[ji];
        if (stop && stop.workflowIds && stop.workflowIds.indexOf(job.workflowId) >= 0) continue;
        try {
          results.push(await pollWorkflowPositions(stored, job));
        } catch (eJ) {
          results.push({ ok: false, error: (eJ && eJ.message) || 'job error', workflowId: job.workflowId });
        }
      }

      await storageLocalSet({
        [JOBS_KEY]: jobs.map(function (j) {
          return {
            workflowId: j.workflowId,
            workflowName: j.workflowName,
            positionCount: (j.positions || []).length,
          };
        }),
      });

      await recordPoll({
        ok: true,
        jobCount: jobs.length,
        positionCount: totalPositions,
        results: results,
      });
    } catch (e) {
      await recordPoll({ ok: false, error: (e && e.message) || 'tick error' });
    }
    scheduleNextAlarm(minPoll);
  }

  function setupAlarm() {
    scheduleNextAlarm(DEFAULT_POLL_MS);
  }

  async function handleStop(payload) {
    var cur = (await storageLocalGet([STOP_KEY]))[STOP_KEY] || {};
    if (payload && payload.global === true) {
      cur.global = true;
    } else if (payload && payload.workflowId) {
      cur.workflowIds = cur.workflowIds || [];
      var wid = String(payload.workflowId).trim();
      if (wid && cur.workflowIds.indexOf(wid) < 0) cur.workflowIds.push(wid);
    } else if (payload && payload.clear === true) {
      cur = { global: false, workflowIds: [] };
    }
    await storageLocalSet({ [STOP_KEY]: cur });
    return { ok: true, stop: cur };
  }

  global.__CFS_v3RangeWatch_tick = tick;
  global.__CFS_v3RangeWatch_setupAlarm = setupAlarm;
  global.__CFS_v3RangeWatch_handleStop = handleStop;
  global.__CFS_v3RangeWatch_isV3PriceRangeWatch = isV3PriceRangeWatch;
  global.__CFS_v3RangeWatch_getStatus = async function () {
    var stored = await storageLocalGet([LAST_POLL_KEY, JOBS_KEY, STOP_KEY]);
    return {
      ok: true,
      lastPoll: stored[LAST_POLL_KEY] || null,
      jobs: stored[JOBS_KEY] || [],
      stop: stored[STOP_KEY] || null,
      defaultPollIntervalMs: DEFAULT_POLL_MS,
    };
  };
  global.__CFS_v3RangeWatch_reconcile = async function (payload) {
    var stored = await storageLocalGet([WORKFLOWS_KEY]);
    var wid = String((payload && payload.workflowId) || 'wf-bsc-v3-monitor').trim();
    var jobs = collectV3MonitorWorkflows(stored).filter(function (j) { return j.workflowId === wid; });
    if (!jobs.length) {
      var w = stored[WORKFLOWS_KEY] && stored[WORKFLOWS_KEY][wid];
      if (!w || !w.alwaysOn) return { ok: false, error: 'workflow not found' };
      jobs = [{
        workflowId: wid,
        alwaysOn: w.alwaysOn,
        priceRangeWatch: w.alwaysOn.priceRangeWatch,
        positions: boundPositionsApi() ? boundPositionsApi().normalizeBoundPositions(w.alwaysOn, 'v3') : [],
      }];
    }
    return reconcileWorkflow(stored, jobs[0]);
  };
})(typeof self !== 'undefined' ? self : globalThis);
