/**
 * Infinity bin LP range watch (MV3 service worker).
 *
 * Multi-position: alwaysOn.boundRows[] (legacy boundRow migrates on read).
 * Sequential range checks (Multicall when packable later). Idle when 0 NFTs.
 */
(function (global) {
  'use strict';

  var ALARM_NAME = 'cfs_infi_bin_range_poll';
  var LAST_POLL_KEY = 'cfsInfiBinRangeWatchLastPoll';
  var JOBS_KEY = 'cfsInfiBinRangeWatchJobs';
  var WORKFLOWS_KEY = 'workflows';
  var STOP_KEY = 'cfsInfiBinRangeWatchStop';
  var ACTIVITY_KEY = 'cfsAlwaysOnActivityLog';
  var DEFAULT_POLL_MS = 60000;
  var MIN_POLL_MS = 5000;

  var cs = globalThis.CFS_CRYPTO_STORAGE;
  var storageLocalGet = cs.storageLocalGet;
  var storageLocalSet = cs.storageLocalSet;
  var BP = globalThis.CFS_ALWAYS_ON_BOUND_POSITIONS || globalThis.__CFS_alwaysOnBoundPositions || null;

  var inFlightByJobKey = Object.create(null);

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

  function boundPositionsApi() {
    return BP || globalThis.CFS_ALWAYS_ON_BOUND_POSITIONS || globalThis.__CFS_alwaysOnBoundPositions || null;
  }

  function positionTokenId(row) {
    var api = boundPositionsApi();
    if (api) return api.positionIdKey('infi', row);
    return String((row && (row.positionNftId || row.infiPositionTokenId)) || '').trim();
  }

  function jobKeyFor(wfId, tokenId, pool) {
    return wfId + '|infi|' + String(tokenId || '') + '|' + String(pool || '');
  }

  function normalizePollMs(raw) {
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_MS;
    return Math.max(MIN_POLL_MS, n);
  }

  function isInfiPriceRangeWatch(prw) {
    if (!prw || typeof prw !== 'object') return false;
    var mode = String(prw.mode || prw.watchMode || '').toLowerCase();
    if (mode === 'infi' || mode === 'infinity') return true;
    if (mode === 'v3' || mode === 'pancake_v3') return false;
    if (typeof global.__CFS_v3RangeWatch_isV3PriceRangeWatch === 'function' &&
        global.__CFS_v3RangeWatch_isV3PriceRangeWatch(prw)) {
      return false;
    }
    var tid = prw.v3PositionTokenId != null ? String(prw.v3PositionTokenId).trim() : '';
    if (tid) return false;
    return !!(prw.infiPositionTokenId || prw.poolId || prw.infiLowerBinId || prw.lowerBinId || prw.positionNftId);
  }

  function collectInfiMonitorWorkflows(stored) {
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
      if (!isInfiPriceRangeWatch(prw)) continue;
      var positions = api
        ? api.activeWatchPositions(wf.alwaysOn, 'infi')
        : (wf.alwaysOn.boundRow && positionTokenId(wf.alwaysOn.boundRow)
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

  async function appendActivity(entry) {
    try {
      var cur = (await storageLocalGet([ACTIVITY_KEY]))[ACTIVITY_KEY];
      var list = Array.isArray(cur) ? cur.slice() : [];
      list.unshift(Object.assign({ ts: Date.now(), family: 'infi' }, entry || {}));
      if (list.length > 50) list = list.slice(0, 50);
      await storageLocalSet({ [ACTIVITY_KEY]: list });
    } catch (_) {}
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
        gasReloadStableToken: ao.gasReloadStableToken || ao.stableToken || ao.usdcToken,
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
      var out = api.removeBoundPosition(ao, tid, 'infi');
      if (out && out.removed) {
        removed.push(tid);
        await appendActivity({ kind: 'removed_burned_nft', tokenId: tid, workflowId: workflowId });
      }
    }
    api.syncPrimaryBoundRow(ao, 'infi');
    if (removed.length) await storageLocalSet({ workflows: wfs });
    return { removed: removed };
  }

  async function triggerOutOfRange(stored, job, positionRow, check, prwTemplate) {
    var prwResolved = resolveTemplatesDeep(prwTemplate || job.priceRangeWatch, positionRow);
    var tokenId = positionTokenId(positionRow) || String(check.infiPositionTokenId || '').trim();
    var triggerRow = Object.assign({}, positionRow || {}, {
      driftDirection: check.direction || (check.activeId > check.upperBinId ? 'above' : 'below'),
      activeBinId: check.activeId,
      poolId: check.poolId || positionRow.poolId || '',
      lowerBinId: check.lowerBinId,
      upperBinId: check.upperBinId,
      positionNftId: tokenId,
      infiPositionTokenId: tokenId,
      inRange: false,
      detectedAt: new Date().toISOString(),
      exitPolicy: positionRow.exitPolicy || prwResolved.exitPolicy || '',
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
        type: 'infi_bin_range_trigger',
        overrideStartUrl: startUrl || undefined,
        startStepIndex: rule.startStepIndex != null ? rule.startStepIndex : undefined,
        activeTab: false,
      };

      var jk = jobKeyFor(job.workflowId, tokenId, triggerRow.poolId);
      if (inFlightByJobKey[jk]) {
        return { ok: true, skipped: true, reason: 'in_flight', triggered: triggered };
      }
      inFlightByJobKey[jk] = true;
      try {
        var hist = await execFn(entry, workflows);
        triggered.push({
          workflowId: entry.workflowId,
          positionNftId: tokenId,
          status: hist && hist.status,
          error: hist && hist.error,
        });
      } finally {
        delete inFlightByJobKey[jk];
      }

      if (!job.runAllMatches) break;
    }
    return { ok: true, triggered: triggered };
  }

  async function checkOnePosition(prwTemplate, positionRow) {
    var prwResolved = resolveTemplatesDeep(prwTemplate, positionRow);
    var tid = positionTokenId(positionRow);
    var checkMsg = {
      infiPositionTokenId: tid || prwResolved.infiPositionTokenId || '',
      poolId: positionRow.poolId || prwResolved.poolId || '',
      infiLowerBinId: positionRow.lowerBinId || positionRow.infiLowerBinId || prwResolved.infiLowerBinId || '',
      infiUpperBinId: positionRow.upperBinId || positionRow.infiUpperBinId || prwResolved.infiUpperBinId || '',
      tokenA: positionRow.tokenA || prwResolved.tokenA || '',
      tokenB: positionRow.tokenB || prwResolved.tokenB || '',
      infinityFee: positionRow.infinityFee || prwResolved.infinityFee || '',
      binStep: positionRow.binStep || prwResolved.binStep || '',
    };
    var fn = global.__CFS_bsc_infi_bin_range_check;
    if (typeof fn !== 'function') {
      return { ok: false, error: 'range check handler not loaded', infiPositionTokenId: tid };
    }
    var check = await fn(checkMsg);
    if (check && typeof check === 'object') {
      check.infiPositionTokenId = check.infiPositionTokenId || tid;
    }
    return check;
  }

  async function pollWorkflowPositions(stored, job) {
    var positions = job.positions || [];
    if (!positions.length) {
      return { ok: true, idle: true, reason: 'no_infi_positions', workflowId: job.workflowId, results: [] };
    }

    var gasInfo = await maybeEnsureGas(job.alwaysOn);
    var closedIds = [];
    var results = [];
    var triggeredAll = [];

    for (var pi = 0; pi < positions.length; pi++) {
      var prow = positions[pi];
      var tid = positionTokenId(prow);
      var check;
      try {
        check = await checkOnePosition(job.priceRangeWatch, prow);
      } catch (eC) {
        results.push({ ok: false, positionNftId: tid, error: (eC && eC.message) || String(eC) });
        continue;
      }
      if (!check || !check.ok) {
        var err = (check && check.error) || 'range check failed';
        if (/not found|burned|owner|missing|zero.?liquidity|invalid token/i.test(String(err))) {
          closedIds.push(tid);
          results.push({ ok: true, positionNftId: tid, closed: true, error: err, check: check });
        } else {
          results.push({ ok: false, positionNftId: tid, error: err, check: check });
        }
        continue;
      }
      if (check.inRange) {
        results.push({ ok: true, inRange: true, positionNftId: tid, check: check });
        continue;
      }
      var trig = await triggerOutOfRange(stored, job, prow, check, job.priceRangeWatch);
      results.push({
        ok: true,
        inRange: false,
        positionNftId: tid,
        check: check,
        triggered: trig.triggered || [],
        skipped: trig.skipped,
      });
      if (trig.triggered) triggeredAll = triggeredAll.concat(trig.triggered);
    }

    if (closedIds.length) {
      await removeClosedFromWorkflow(stored, job.workflowId, closedIds);
    }

    return {
      ok: true,
      workflowId: job.workflowId,
      results: results,
      triggered: triggeredAll,
      closedRemoved: closedIds,
      gasTopUp: gasInfo,
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

      var jobs = collectInfiMonitorWorkflows(stored);
      if (jobs.length === 0) {
        await recordPoll({ ok: true, idle: true, reason: 'no_infi_price_range_jobs' });
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
          reason: 'no_infi_positions',
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

  global.__CFS_infiBinRangeWatch_tick = tick;
  global.__CFS_infiBinRangeWatch_setupAlarm = setupAlarm;
  global.__CFS_infiBinRangeWatch_handleStop = handleStop;
  global.__CFS_infiBinRangeWatch_isInfiPriceRangeWatch = isInfiPriceRangeWatch;
  global.__CFS_infiBinRangeWatch_getStatus = async function () {
    var stored = await storageLocalGet([LAST_POLL_KEY, JOBS_KEY, STOP_KEY]);
    return {
      ok: true,
      lastPoll: stored[LAST_POLL_KEY] || null,
      jobs: stored[JOBS_KEY] || [],
      stop: stored[STOP_KEY] || null,
      defaultPollIntervalMs: DEFAULT_POLL_MS,
    };
  };
})(typeof self !== 'undefined' ? self : globalThis);
