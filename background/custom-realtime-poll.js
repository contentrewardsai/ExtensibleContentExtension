/**
 * Shared custom HTTP / WebSocket always-on poller (MV3 service worker).
 * One alarm for all custom keys; sockets live here (not offscreen).
 *
 * chrome.storage.local:
 * - cfsCustomRealtimeLastPoll — { [feedKey]: { ts, ok, snippet?, error?, idle? } }
 */
(function (global) {
  'use strict';

  var ALARM_NAME = 'cfs_custom_realtime_poll';
  var LAST_POLL_KEY = 'cfsCustomRealtimeLastPoll';
  var WORKFLOWS_KEY = 'workflows';
  var HIDE_KEY = 'cfsHideE2eTestingWorkflows';
  var MIN_POLL_MS = 30000;
  var DEFAULT_POLL_MS = 30000;

  var cs = globalThis.CFS_CRYPTO_STORAGE;
  var storageLocalGet = cs.storageLocalGet;
  var storageLocalSet = cs.storageLocalSet;

  var inFlightByJobKey = Object.create(null);
  var wsByKey = Object.create(null);
  var lastDedupeByKey = Object.create(null);

  function feedsApi() {
    return global.CFS_realtimeFeeds;
  }

  function alwaysOnApi() {
    return global.__CFS_alwaysOnFromSteps;
  }

  function clampPoll(ms) {
    var n = parseInt(ms, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_POLL_MS;
    return Math.max(MIN_POLL_MS, n);
  }

  function collectCustomJobs(stored) {
    var RF = feedsApi();
    if (!RF || typeof RF.collectFeeds !== 'function') return [];
    var feeds = RF.collectFeeds(stored);
    var jobs = [];
    for (var i = 0; i < feeds.length; i++) {
      var f = feeds[i];
      if (f.source !== 'customHttp' && f.source !== 'customWs') continue;
      jobs.push(f);
    }
    return jobs;
  }

  async function recordPollMap(patch) {
    var cur = (await storageLocalGet([LAST_POLL_KEY]))[LAST_POLL_KEY];
    var map = cur && typeof cur === 'object' && !Array.isArray(cur) ? Object.assign({}, cur) : {};
    var keys = Object.keys(patch);
    for (var i = 0; i < keys.length; i++) map[keys[i]] = patch[keys[i]];
    /* Drop keys no longer in patch set when caller passes _retain */
    await storageLocalSet({ [LAST_POLL_KEY]: map });
    return map;
  }

  function prunePollMap(map, liveKeys) {
    var out = {};
    for (var i = 0; i < liveKeys.length; i++) {
      var k = liveKeys[i];
      if (map[k]) out[k] = map[k];
    }
    return out;
  }

  function scheduleNextAlarm(pollIntervalMs) {
    var when = Date.now() + clampPoll(pollIntervalMs);
    try {
      chrome.alarms.create(ALARM_NAME, { when: when });
    } catch (_) {}
  }

  async function clearAlarmIfIdle() {
    try {
      await chrome.alarms.clear(ALARM_NAME);
    } catch (_) {}
  }

  function parseJsonMaybe(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  function getByPath(obj, pathStr) {
    if (!pathStr || typeof pathStr !== 'string') return obj;
    var parts = pathStr.trim().split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }

  function payloadChanged(key, payload, dedupeField) {
    var marker;
    if (dedupeField && payload && typeof payload === 'object') {
      marker = String(getByPath(payload, dedupeField));
    } else {
      try {
        marker = typeof payload === 'string' ? payload : JSON.stringify(payload);
      } catch (_) {
        marker = String(payload);
      }
    }
    if (marker === lastDedupeByKey[key]) return false;
    lastDedupeByKey[key] = marker;
    return true;
  }

  function signalConsumersFor(job) {
    if (job && Array.isArray(job.signalConsumers) && job.signalConsumers.length) return job.signalConsumers;
    if (job && job.onSignalWorkflowId) {
      return [{
        onSignalWorkflowId: job.onSignalWorkflowId,
        onSignalStartStepIndex: job.onSignalStartStepIndex,
        payloadPath: job.payloadPath || '',
        dedupeField: job.dedupeField || '',
        matchPath: job.matchPath || job.wsMatchPath || '',
        matchRegex: job.matchRegex || job.wsMatchRegex || '',
      }];
    }
    return [];
  }

  async function fireOnSignal(job, consumer, payload, workflows) {
    var childId = String((consumer && consumer.onSignalWorkflowId) || '').trim();
    if (!childId) return;
    var execFn = global.__CFS_executeBackgroundWorkflow;
    if (typeof execFn !== 'function') return;
    var jk = job.key + '|' + childId + '|' + String((consumer && consumer._id) || '');
    if (inFlightByJobKey[jk]) return;
    inFlightByJobKey[jk] = true;
    try {
      var row = { realtimePayload: payload };
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        row = Object.assign({}, payload, row);
      }
      var startIdx = consumer && consumer.onSignalStartStepIndex;
      if (startIdx === '' || startIdx == null) startIdx = undefined;
      else startIdx = parseInt(startIdx, 10);
      await execFn({
        workflowId: childId,
        row: row,
        type: 'custom_realtime_signal',
        startStepIndex: Number.isFinite(startIdx) ? startIdx : undefined,
        activeTab: false,
      }, workflows || {});
    } catch (_) {
    } finally {
      delete inFlightByJobKey[jk];
    }
  }

  async function pollHttpJob(job, workflows) {
    var RF = feedsApi();
    var url = job.url;
    if (!url || RF.isDangerousUrl(url) || RF.hasTemplateVars(url)) {
      return { ts: Date.now(), ok: false, error: 'invalid_url' };
    }
    if (RF.headersOversize && RF.headersOversize(job.headersJson)) {
      return { ts: Date.now(), ok: false, error: 'headers_too_large' };
    }
    var headers = RF.parseHeadersJson(job.headersJson) || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    try {
      if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 20000);
      var res = await fetch(url, { method: 'GET', headers: headers, signal: ctrl ? ctrl.signal : undefined });
      var text = await res.text();
      var json = parseJsonMaybe(text);
      var consumers = signalConsumersFor(job);
      var snippetPayload = json;
      if (consumers.length) {
        for (var ci = 0; ci < consumers.length; ci++) {
          var c = consumers[ci];
          var payload = json;
          if (c.payloadPath) payload = getByPath(json, c.payloadPath);
          if (ci === 0) snippetPayload = payload;
          var dKey = job.key + '|' + (c._id || ci);
          var changed = payloadChanged(dKey, payload, c.dedupeField);
          if (changed) await fireOnSignal(job, c, payload, workflows);
        }
      }
      var snippet = RF.capPayload(snippetPayload);
      return { ts: Date.now(), ok: res.ok, status: res.status, snippet: snippet };
    } catch (e) {
      return { ts: Date.now(), ok: false, error: (e && e.message) || 'fetch_error' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function closeWs(key) {
    var rec = wsByKey[key];
    if (!rec) return;
    try {
      if (rec.ws) rec.ws.close();
    } catch (_) {}
    delete wsByKey[key];
  }

  function ensureWs(job, workflows) {
    var RF = feedsApi();
    var url = job.url;
    if (!url || RF.isDangerousUrl(url) || RF.hasTemplateVars(url)) return;
    var rec = wsByKey[job.key];
    if (rec && rec.ws && (rec.ws.readyState === 0 || rec.ws.readyState === 1)) {
      rec.job = job;
      rec.workflows = workflows;
      return;
    }
    closeWs(job.key);
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      recordPollMap({ [job.key]: { ts: Date.now(), ok: false, error: (e && e.message) || 'ws_construct' } });
      return;
    }
    rec = { ws: ws, job: job, workflows: workflows };
    wsByKey[job.key] = rec;
    ws.onopen = function () {
      var sub = String(rec.job.wsSubscribeJson || rec.job.subscribeJson || '').trim();
      if (sub) {
        try { ws.send(sub); } catch (_) {}
      }
      recordPollMap({ [rec.job.key]: { ts: Date.now(), ok: true, idle: false, connected: true } });
    };
    ws.onmessage = function (ev) {
      var data = ev && ev.data;
      var parsed = parseJsonMaybe(data);
      var consumers = signalConsumersFor(rec.job);
      var snippetBody = parsed;
      if (!consumers.length) {
        var matchPath = rec.job.matchPath || rec.job.wsMatchPath || '';
        var matchRe = rec.job.matchRegex || rec.job.wsMatchRegex || '';
        var body = parsed;
        if (matchPath) body = getByPath(parsed, matchPath);
        if (matchRe) {
          try {
            var re = new RegExp(matchRe);
            var s = typeof body === 'string' ? body : JSON.stringify(body);
            if (!re.test(s)) return;
          } catch (_) {}
        }
        snippetBody = body;
      } else {
        for (var ci = 0; ci < consumers.length; ci++) {
          var c = consumers[ci];
          var cBody = parsed;
          if (c.matchPath) cBody = getByPath(parsed, c.matchPath);
          if (c.matchRegex) {
            try {
              var cre = new RegExp(c.matchRegex);
              var cs = typeof cBody === 'string' ? cBody : JSON.stringify(cBody);
              if (!cre.test(cs)) continue;
            } catch (_) {}
          }
          if (ci === 0) snippetBody = cBody;
          var dKey = rec.job.key + '|' + (c._id || ci);
          var changed = payloadChanged(dKey, cBody, c.dedupeField);
          if (changed) fireOnSignal(rec.job, c, cBody, rec.workflows);
        }
      }
      var snippet = RF.capPayload(snippetBody);
      recordPollMap({ [rec.job.key]: { ts: Date.now(), ok: true, snippet: snippet } });
    };
    ws.onerror = function () {
      recordPollMap({ [rec.job.key]: { ts: Date.now(), ok: false, error: 'ws_error' } });
    };
    ws.onclose = function () {
      if (wsByKey[job.key] && wsByKey[job.key].ws === ws) delete wsByKey[job.key];
    };
  }

  async function tick() {
    var minPoll = DEFAULT_POLL_MS;
    try {
      var stored = await storageLocalGet([WORKFLOWS_KEY, HIDE_KEY]);
      var evalFn = global.__CFS_evaluateAlwaysOnAutomation || global.__CFS_evaluateFollowingAutomation;
      if (typeof evalFn === 'function') {
        var gate = evalFn(stored);
        if (!gate.allowCustom) {
          var live = Object.keys(wsByKey);
          for (var c = 0; c < live.length; c++) closeWs(live[c]);
          await recordPollMap({ _idle: { ts: Date.now(), ok: true, idle: true, reason: 'custom_not_enabled' } });
          await clearAlarmIfIdle();
          return;
        }
      }
      var jobs = collectCustomJobs(stored);
      var workflows = stored[WORKFLOWS_KEY] || {};
      var liveKeys = [];
      var patch = {};
      for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        liveKeys.push(job.key);
        if (job.pollIntervalMs) minPoll = Math.min(minPoll, clampPoll(job.pollIntervalMs));
        if (job.source === 'customWs') {
          ensureWs(job, workflows);
        } else {
          patch[job.key] = await pollHttpJob(job, workflows);
        }
      }
      var wsKeys = Object.keys(wsByKey);
      for (var w = 0; w < wsKeys.length; w++) {
        if (liveKeys.indexOf(wsKeys[w]) < 0) closeWs(wsKeys[w]);
      }
      var cur = (await storageLocalGet([LAST_POLL_KEY]))[LAST_POLL_KEY];
      var map = cur && typeof cur === 'object' ? Object.assign({}, cur) : {};
      var pk = Object.keys(patch);
      for (var p = 0; p < pk.length; p++) map[pk[p]] = patch[pk[p]];
      map = prunePollMap(map, liveKeys);
      await storageLocalSet({ [LAST_POLL_KEY]: map });
      if (!jobs.length) {
        await clearAlarmIfIdle();
        return;
      }
    } catch (e) {
      await recordPollMap({ _error: { ts: Date.now(), ok: false, error: (e && e.message) || 'tick_error' } });
    }
    scheduleNextAlarm(minPoll);
  }

  function setupAlarm() {
    scheduleNextAlarm(DEFAULT_POLL_MS);
  }

  global.__CFS_customRealtime_tick = tick;
  global.__CFS_customRealtime_setupAlarm = setupAlarm;
  global.__CFS_customRealtime_getStatus = async function () {
    var stored = await storageLocalGet([LAST_POLL_KEY]);
    return { ok: true, lastPoll: stored[LAST_POLL_KEY] || null, minPollMs: MIN_POLL_MS };
  };
})(typeof self !== 'undefined' ? self : globalThis);
