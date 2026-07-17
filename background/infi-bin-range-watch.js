/**
 * Infinity bin LP range watch (MV3 service worker).
 *
 * Polls CFS_BSC_INFI_BIN_RANGE_CHECK for workflows with alwaysOn.scopes.priceRangeWatch.
 * On out-of-range, evaluates onOutOfRange rules (runIf) and runs child workflows via
 * __CFS_executeBackgroundWorkflow.
 */
(function (global) {
  'use strict';

  var ALARM_NAME = 'cfs_infi_bin_range_poll';
  var LAST_POLL_KEY = 'cfsInfiBinRangeWatchLastPoll';
  var JOBS_KEY = 'cfsInfiBinRangeWatchJobs';
  var WORKFLOWS_KEY = 'workflows';
  var STOP_KEY = 'cfsInfiBinRangeWatchStop';

  var cs = globalThis.CFS_CRYPTO_STORAGE;
  var storageLocalGet = cs.storageLocalGet;
  var storageLocalSet = cs.storageLocalSet;

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

  function jobKeyFor(wfId, prw) {
    var pos = (prw && prw.infiPositionTokenId) || '';
    var pool = (prw && prw.poolId) || '';
    return wfId + '|' + String(pos) + '|' + String(pool);
  }

  function collectPriceRangeWatchJobs(stored) {
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return [];
    var ids = Object.keys(w);
    var jobs = [];
    for (var i = 0; i < ids.length; i++) {
      var wfId = ids[i];
      var wf = w[wfId];
      if (!wf || !wf.alwaysOn || wf.alwaysOn.enabled !== true) continue;
      var sc = (wf.alwaysOn && wf.alwaysOn.scopes) || {};
      if (!sc.priceRangeWatch) continue;
      var prw = wf.alwaysOn.priceRangeWatch;
      if (!prw || typeof prw !== 'object') continue;
      var boundRow = (wf.alwaysOn.boundRow && typeof wf.alwaysOn.boundRow === 'object') ? wf.alwaysOn.boundRow : {};
      jobs.push({
        workflowId: wfId,
        workflowName: wf.name || wfId,
        pollIntervalMs: wf.alwaysOn.pollIntervalMs || 60000,
        boundRow: boundRow,
        priceRangeWatch: prw,
        runAllMatches: prw.runAllMatches === true,
      });
    }
    return jobs;
  }

  function recordPoll(fields) {
    var payload = Object.assign({ ts: Date.now() }, fields);
    return storageLocalSet({ [LAST_POLL_KEY]: payload }).catch(function () {});
  }

  async function pollOneJob(stored, job) {
    var prwResolved = resolveTemplatesDeep(job.priceRangeWatch, job.boundRow);
    var rowBase = Object.assign({}, job.boundRow || {});
    var checkMsg = {
      infiPositionTokenId: prwResolved.infiPositionTokenId || '',
      poolId: prwResolved.poolId || '',
      infiLowerBinId: prwResolved.infiLowerBinId || '',
      infiUpperBinId: prwResolved.infiUpperBinId || '',
      tokenA: prwResolved.tokenA || '',
      tokenB: prwResolved.tokenB || '',
      infinityFee: prwResolved.infinityFee || '',
      binStep: prwResolved.binStep || '',
    };
    var fn = global.__CFS_bsc_infi_bin_range_check;
    if (typeof fn !== 'function') {
      return { ok: false, error: 'range check handler not loaded', job: job };
    }
    var check = await fn(checkMsg);
    if (!check || !check.ok) {
      return { ok: false, error: (check && check.error) || 'range check failed', job: job };
    }
    if (check.inRange) {
      return { ok: true, inRange: true, check: check, job: job };
    }

    var triggerRow = Object.assign({}, rowBase, {
      driftDirection: check.direction || (check.activeId > check.upperBinId ? 'above' : 'below'),
      activeBinId: check.activeId,
      poolId: check.poolId || prwResolved.poolId || '',
      lowerBinId: check.lowerBinId,
      upperBinId: check.upperBinId,
      inRange: false,
      detectedAt: new Date().toISOString(),
    });

    var rules = Array.isArray(prwResolved.onOutOfRange) ? prwResolved.onOutOfRange : [];
    var workflows = stored[WORKFLOWS_KEY] || {};
    var execFn = global.__CFS_executeBackgroundWorkflow;
    if (typeof execFn !== 'function') {
      return { ok: false, error: 'background workflow runner not loaded', inRange: false, check: check, job: job };
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

      var jk = jobKeyFor(job.workflowId, prwResolved);
      if (inFlightByJobKey[jk]) {
        return { ok: true, inRange: false, skipped: true, reason: 'in_flight', check: check, job: job };
      }
      inFlightByJobKey[jk] = true;
      try {
        var hist = await execFn(entry, workflows);
        triggered.push({ workflowId: entry.workflowId, status: hist && hist.status, error: hist && hist.error });
      } finally {
        delete inFlightByJobKey[jk];
      }

      if (childRow.positionNftId || childRow.lowerBinId || childRow.upperBinId) {
        var wfs = stored[WORKFLOWS_KEY];
        if (wfs && wfs[job.workflowId] && wfs[job.workflowId].alwaysOn) {
          wfs[job.workflowId].alwaysOn.boundRow = Object.assign({}, wfs[job.workflowId].alwaysOn.boundRow || {}, {
            positionNftId: childRow.positionNftId || (wfs[job.workflowId].alwaysOn.boundRow || {}).positionNftId,
            lowerBinId: childRow.lowerBinId != null ? childRow.lowerBinId : (wfs[job.workflowId].alwaysOn.boundRow || {}).lowerBinId,
            upperBinId: childRow.upperBinId != null ? childRow.upperBinId : (wfs[job.workflowId].alwaysOn.boundRow || {}).upperBinId,
            poolId: childRow.poolId || (wfs[job.workflowId].alwaysOn.boundRow || {}).poolId,
          });
          await storageLocalSet({ workflows: wfs });
        }
      }

      if (!job.runAllMatches) break;
    }

    return { ok: true, inRange: false, triggered: triggered, check: check, job: job };
  }

  async function tick() {
    try {
      var stored = await storageLocalGet([WORKFLOWS_KEY, STOP_KEY, JOBS_KEY]);
      var stop = stored[STOP_KEY];
      if (stop && stop.global === true) {
        await recordPoll({ ok: true, idle: true, reason: 'globally_stopped' });
        return;
      }

      var evalFn = global.__CFS_evaluateAlwaysOnAutomation || global.__CFS_evaluateFollowingAutomation;
      if (typeof evalFn === 'function') {
        var gate = evalFn(stored);
        if (!gate.allowPriceRangeWatch) {
          await recordPoll({ ok: true, idle: true, reason: 'price_range_watch_not_enabled' });
          return;
        }
      }

      var jobs = collectPriceRangeWatchJobs(stored);
      if (jobs.length === 0) {
        await recordPoll({ ok: true, idle: true, reason: 'no_price_range_jobs' });
        return;
      }

      var results = [];
      for (var ji = 0; ji < jobs.length; ji++) {
        var job = jobs[ji];
        if (stop && stop.workflowIds && stop.workflowIds.indexOf(job.workflowId) >= 0) continue;
        try {
          results.push(await pollOneJob(stored, job));
        } catch (eJ) {
          results.push({ ok: false, error: (eJ && eJ.message) || 'job error', job: job });
        }
      }

      await storageLocalSet({
        [JOBS_KEY]: jobs.map(function (j) {
          return { workflowId: j.workflowId, workflowName: j.workflowName };
        }),
      });

      await recordPoll({ ok: true, jobCount: jobs.length, results: results });
    } catch (e) {
      await recordPoll({ ok: false, error: (e && e.message) || 'tick error' });
    }
  }

  function setupAlarm() {
    try {
      chrome.alarms.get(ALARM_NAME, function (existing) {
        if (!existing) {
          chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        }
      });
    } catch (_) {}
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
  global.__CFS_infiBinRangeWatch_getStatus = async function () {
    var stored = await storageLocalGet([LAST_POLL_KEY, JOBS_KEY, STOP_KEY]);
    return {
      ok: true,
      lastPoll: stored[LAST_POLL_KEY] || null,
      jobs: stored[JOBS_KEY] || [],
      stop: stored[STOP_KEY] || null,
    };
  };
})(typeof self !== 'undefined' ? self : globalThis);
