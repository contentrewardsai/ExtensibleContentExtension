/**
 * Raydium CLMM range watch (MV3 service worker). Shared poll per pool; OOR child workflows like V3.
 */
(function (global) {
  'use strict';

  var ALARM_NAME = 'cfs_clmm_range_poll';
  var LAST_POLL_KEY = 'cfsClmmRangeWatchLastPoll';
  var WORKFLOWS_KEY = 'workflows';
  var HIDE_KEY = 'cfsHideE2eTestingWorkflows';
  var ACTIVITY_KEY = 'cfsAlwaysOnActivityLog';
  var DEFAULT_POLL_MS = 30000;
  var MIN_POLL_MS = 30000;

  var cs = globalThis.CFS_CRYPTO_STORAGE;
  var storageLocalGet = cs.storageLocalGet;
  var storageLocalSet = cs.storageLocalSet;
  var inFlightByJobKey = Object.create(null);

  function normalizePollMs(raw) {
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_MS;
    return Math.max(MIN_POLL_MS, n);
  }

  function collectJobs(stored) {
    var RF = global.CFS_realtimeFeeds;
    var raw = RF && typeof RF.collectClmmRangeJobs === 'function' ? RF.collectClmmRangeJobs(stored) : [];
    var jobs = [];
    for (var i = 0; i < raw.length; i++) {
      var job = raw[i];
      var prw = job.priceRangeWatch || {};
      jobs.push(Object.assign({}, job, {
        pollIntervalMs: normalizePollMs((job.alwaysOn && job.alwaysOn.pollIntervalMs) || prw.pollIntervalMs),
      }));
    }
    return jobs;
  }

  function callRangeCheck(msg) {
    return new Promise(function (resolve) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers.CFS_RAYDIUM_CLMM_RANGE_CHECK;
      if (typeof impl !== 'function') {
        resolve({ ok: false, error: 'CLMM range check not loaded' });
        return;
      }
      impl(msg, {}, function (res) { resolve(res || { ok: false }); });
    });
  }

  function evaluateRunIf(runIfRaw, row) {
    var ws = global.CFS_watchShared;
    if (ws && typeof ws.evaluateRunIf === 'function') return ws.evaluateRunIf(runIfRaw, row);
    if (!String(runIfRaw || '').trim()) return true;
    return false;
  }

  async function appendActivity(entry) {
    try {
      var cur = (await storageLocalGet([ACTIVITY_KEY]))[ACTIVITY_KEY];
      var list = Array.isArray(cur) ? cur.slice() : [];
      list.unshift(Object.assign({ ts: Date.now(), family: 'clmm' }, entry || {}));
      if (list.length > 50) list = list.slice(0, 50);
      await storageLocalSet({ [ACTIVITY_KEY]: list });
    } catch (_) {}
  }

  async function triggerOor(stored, job, pos, check) {
    var prw = job.priceRangeWatch || {};
    var rules = Array.isArray(prw.onOutOfRange) ? prw.onOutOfRange : [];
    var execFn = global.__CFS_executeBackgroundWorkflow;
    if (typeof execFn !== 'function') return;
    var direction = check.currentTick > check.tickUpper ? 'above' : 'below';
    var triggerRow = Object.assign({}, pos.row || {}, {
      driftDirection: direction,
      currentTick: check.currentTick,
      tickLower: check.tickLower,
      tickUpper: check.tickUpper,
      poolId: pos.poolId,
      positionNftMint: pos.positionNftMint,
      inRange: false,
    });
    var workflows = stored[WORKFLOWS_KEY] || {};
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (!rule || !rule.workflowId) continue;
      if (!evaluateRunIf(rule.runIf, triggerRow)) continue;
      var jk = job.workflowId + '|clmm|' + pos.positionNftMint;
      if (inFlightByJobKey[jk]) return;
      inFlightByJobKey[jk] = true;
      try {
        var hist = await execFn({
          workflowId: String(rule.workflowId).trim(),
          row: triggerRow,
          type: 'clmm_range_trigger',
          startStepIndex: rule.startStepIndex != null ? rule.startStepIndex : undefined,
          activeTab: false,
        }, workflows);
        await appendActivity({
          kind: 'oor_trigger',
          workflowId: job.workflowId,
          childWorkflowId: rule.workflowId,
          positionNftMint: pos.positionNftMint,
          status: hist && hist.status,
        });
      } finally {
        delete inFlightByJobKey[jk];
      }
      if (!prw.runAllMatches) break;
    }
  }

  function scheduleNextAlarm(pollIntervalMs) {
    try {
      chrome.alarms.create(ALARM_NAME, { when: Date.now() + normalizePollMs(pollIntervalMs) });
    } catch (_) {}
  }

  async function tick() {
    var minPoll = DEFAULT_POLL_MS;
    try {
      var stored = await storageLocalGet([WORKFLOWS_KEY, HIDE_KEY]);
      var evalFn = global.__CFS_evaluateAlwaysOnAutomation || global.__CFS_evaluateFollowingAutomation;
      if (typeof evalFn === 'function' && !evalFn(stored).allowPriceRangeWatch) {
        await storageLocalSet({ [LAST_POLL_KEY]: { ts: Date.now(), ok: true, idle: true, reason: 'price_range_off' } });
        return;
      }
      var jobs = collectJobs(stored);
      var lastInRange = null;
      var anyOor = false;
      for (var ji = 0; ji < jobs.length; ji++) {
        var job = jobs[ji];
        minPoll = Math.min(minPoll, job.pollIntervalMs);
        for (var pi = 0; pi < job.positions.length; pi++) {
          var pos = job.positions[pi];
          var check = await callRangeCheck({ poolId: pos.poolId, positionNftMint: pos.positionNftMint });
          if (check && check.ok) {
            lastInRange = check.inRange;
            if (check.inRange === false) {
              anyOor = true;
              await triggerOor(stored, job, pos, check);
            }
          }
        }
      }
      await storageLocalSet({
        [LAST_POLL_KEY]: {
          ts: Date.now(),
          ok: true,
          idle: !jobs.length,
          jobCount: jobs.length,
          inRange: anyOor ? false : lastInRange,
        },
      });
      if (!jobs.length) return;
    } catch (e) {
      await storageLocalSet({ [LAST_POLL_KEY]: { ts: Date.now(), ok: false, error: (e && e.message) || 'tick' } });
    }
    scheduleNextAlarm(minPoll);
  }

  function setupAlarm() {
    scheduleNextAlarm(DEFAULT_POLL_MS);
  }

  global.__CFS_clmmRangeWatch_tick = tick;
  global.__CFS_clmmRangeWatch_setupAlarm = setupAlarm;
  global.__CFS_clmmRangeWatch_collectJobs = collectJobs;
})(typeof self !== 'undefined' ? self : globalThis);
