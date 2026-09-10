/**
 * Shared real-time feed registry: unique feeds from checkRealtimeData / derived alwaysOn.
 * Loaded in the side panel, unit tests, and service worker.
 *
 * Feed keys:
 *   following:solana | following:bsc
 *   file:{projectId}
 *   priceRange:v3 | priceRange:infi
 *   priceRange:raydiumClmm:{poolId} | priceRange:meteoraDlmm:{lbPair}
 *   custom:http:{url}#{authFp} | custom:ws:{url}#{authFp}
 */
(function (global) {
  'use strict';

  var CHECK_STEP = 'checkRealtimeData';
  var MIN_CUSTOM_POLL_MS = 30000;
  var MAX_PAYLOAD_CHARS = 8192;
  var MAX_HEADERS_CHARS = 4096;

  function api() {
    return global.__CFS_alwaysOnFromSteps || null;
  }

  function fingerprint(str) {
    var s = String(str || '');
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }

  function normalizeHeadersJson(raw) {
    if (raw == null) return '';
    var t = String(raw).trim();
    if (!t) return '';
    if (t.charAt(0) === '{') {
      try {
        var obj = JSON.parse(t);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return t.toLowerCase();
        var keys = Object.keys(obj).sort();
        var ordered = {};
        for (var i = 0; i < keys.length; i++) ordered[keys[i].toLowerCase()] = String(obj[keys[i]]);
        return JSON.stringify(ordered);
      } catch (_) {
        return t.toLowerCase();
      }
    }
    return t.toLowerCase().replace(/\s+/g, ' ');
  }

  function parseHeadersJson(headersJson) {
    if (!headersJson || typeof headersJson !== 'string') return undefined;
    var trimmed = headersJson.trim();
    if (!trimmed) return undefined;
    if (trimmed.charAt(0) === '{') {
      try {
        var o = JSON.parse(trimmed);
        return o && typeof o === 'object' && !Array.isArray(o) ? o : undefined;
      } catch (_) {
        return undefined;
      }
    }
    var out = {};
    trimmed.split(/\n/).forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx > 0) {
        var key = line.slice(0, idx).trim();
        var val = line.slice(idx + 1).trim();
        if (key) out[key] = val;
      }
    });
    return Object.keys(out).length ? out : undefined;
  }

  function isDangerousUrl(url) {
    var s = String(url || '').trim().toLowerCase();
    if (!s) return true;
    return /^(file:|chrome:|chrome-extension:|javascript:|data:)/.test(s);
  }

  function hasTemplateVars(url) {
    return /\{\{/.test(String(url || ''));
  }

  function normalizeUrlForKey(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    try {
      var u = new URL(s);
      u.hash = '';
      u.hostname = u.hostname.toLowerCase();
      return u.toString();
    } catch (_) {
      return s.replace(/#.*$/, '');
    }
  }

  function displayUrl(url) {
    var s = String(url || '').trim();
    try {
      var u = new URL(s);
      return u.origin + u.pathname;
    } catch (_) {
      return s.split('?')[0].split('#')[0];
    }
  }

  function customHttpFeedKey(url, headersJson) {
    var nu = normalizeUrlForKey(url);
    if (!nu) return '';
    return 'custom:http:' + nu + '#' + fingerprint(normalizeHeadersJson(headersJson));
  }

  function customWsFeedKey(url, subscribeJson) {
    var nu = normalizeUrlForKey(url);
    if (!nu) return '';
    return 'custom:ws:' + nu + '#' + fingerprint(String(subscribeJson || '').trim());
  }

  function clampCustomPollMs(raw) {
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return MIN_CUSTOM_POLL_MS;
    return Math.max(MIN_CUSTOM_POLL_MS, n);
  }

  function capPayload(val) {
    try {
      var s = typeof val === 'string' ? val : JSON.stringify(val);
      if (s.length <= MAX_PAYLOAD_CHARS) return s;
      return s.slice(0, MAX_PAYLOAD_CHARS) + '…';
    } catch (_) {
      return '';
    }
  }

  function priceRangeMode(wf, action) {
    var fromAction = action && action.priceRangeMode ? String(action.priceRangeMode).trim() : '';
    if (fromAction) return fromAction;
    var prw = wf && wf.alwaysOn && wf.alwaysOn.priceRangeWatch;
    if (prw && prw.mode) return String(prw.mode);
    return 'v3';
  }

  function boundPoolId(wf) {
    var ao = wf && wf.alwaysOn;
    if (!ao) return '';
    var row = ao.boundRow || {};
    var rows = Array.isArray(ao.boundRows) && ao.boundRows.length ? ao.boundRows : [row];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var pid = String(r.poolId || r.v3Pool || r.clmmPoolId || '').trim();
      if (pid) return pid;
    }
    return '';
  }

  function boundLbPair(wf) {
    var ao = wf && wf.alwaysOn;
    if (!ao) return '';
    var row = ao.boundRow || {};
    var rows = Array.isArray(ao.boundRows) && ao.boundRows.length ? ao.boundRows : [row];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var p = String(r.lbPair || r.dlmmLbPair || '').trim();
      if (p) return p;
    }
    return '';
  }

  function addConsumer(feed, familyId, name) {
    if (!feed) return;
    if (!feed.consumerFamilies) feed.consumerFamilies = [];
    for (var i = 0; i < feed.consumerFamilies.length; i++) {
      if (feed.consumerFamilies[i].familyId === familyId) return;
    }
    feed.consumerFamilies.push({ familyId: familyId, name: name || familyId });
  }

  function addSignalConsumer(feed, spec) {
    if (!feed) return;
    if (!feed.signalConsumers) feed.signalConsumers = [];
    var id = String(spec.familyId || '') + '|' + String(spec.onSignalWorkflowId || '') + '|' +
      String(spec.payloadPath || '') + '|' + String(spec.matchRegex || spec.wsMatchRegex || '');
    for (var i = 0; i < feed.signalConsumers.length; i++) {
      if (feed.signalConsumers[i]._id === id) return;
    }
    spec._id = id;
    feed.signalConsumers.push(spec);
  }

  function headersOversize(headersJson) {
    return String(headersJson || '').length > MAX_HEADERS_CHARS;
  }

  /**
   * @param {object} stored chrome.storage snapshot with workflows (+ optional hide key)
   * @returns {object[]} unique feeds
   */
  function collectFeeds(stored) {
    var helper = api();
    var members = helper && typeof helper.collectLatestFamilyWorkflows === 'function'
      ? helper.collectLatestFamilyWorkflows(stored || {})
      : [];
    var byKey = Object.create(null);

    function ensure(key, fields) {
      if (!key) return null;
      if (!byKey[key]) {
        byKey[key] = Object.assign({ key: key, consumerFamilies: [] }, fields || {});
      }
      return byKey[key];
    }

    for (var i = 0; i < members.length; i++) {
      var id = members[i].id;
      var wf = members[i].wf;
      if (!helper.workflowAlwaysOnEnabled(wf)) continue;
      var sc = helper.scopesForWorkflow(wf);
      var fk = helper.familyKey(wf, id);
      var name = wf.name || id;

      if (sc.followingSolanaWatch || sc.followingAutomationSolana) {
        addConsumer(ensure('following:solana', { source: 'followingSolana', label: 'Following Solana', lastPollKey: 'cfsSolanaWatchLastPoll' }), fk, name);
      }
      if (sc.followingBscWatch || sc.followingAutomationBsc) {
        addConsumer(ensure('following:bsc', { source: 'followingBsc', label: 'Following BSC', lastPollKey: 'cfsBscWatchLastPoll' }), fk, name);
      }
      if (sc.fileWatch) {
        var pid = (wf.alwaysOn && wf.alwaysOn.projectId) || firstProjectIdFromSteps(wf) || 'default';
        addConsumer(ensure('file:' + pid, {
          source: 'fileWatch',
          label: 'File watch',
          projectId: pid,
          lastPollKey: 'cfsFileWatchLastPoll',
          needsSidePanel: true,
        }), fk, name);
      }
      if (sc.priceRangeWatch) {
        var stepsPr = helper.listCheckSteps(wf);
        var modes = [];
        if (stepsPr.length) {
          for (var spi = 0; spi < stepsPr.length; spi++) {
            if (!helper.sourcesFromAction(stepsPr[spi]).priceRangeWatch) continue;
            var mm = String(priceRangeMode(wf, stepsPr[spi]) || 'v3').toLowerCase();
            if (modes.indexOf(mm) < 0) modes.push(mm);
          }
        }
        if (!modes.length) modes.push(String(priceRangeMode(wf, null) || 'v3').toLowerCase());
        for (var mi = 0; mi < modes.length; mi++) {
          var m = modes[mi];
          if (m === 'raydiumclmm' || m === 'raydium_clmm' || m === 'clmm') {
            var pool = boundPoolId(wf) || 'unbound';
            addConsumer(ensure('priceRange:raydiumClmm:' + pool, {
              source: 'raydiumClmm',
              label: 'Raydium CLMM',
              poolId: pool,
              lastPollKey: 'cfsClmmRangeWatchLastPoll',
            }), fk, name);
          } else if (m === 'meteoradlmm' || m === 'meteora_dlmm' || m === 'dlmm') {
            var pair = boundLbPair(wf) || 'unbound';
            addConsumer(ensure('priceRange:meteoraDlmm:' + pair, {
              source: 'meteoraDlmm',
              label: 'Meteora DLMM',
              lbPair: pair,
              lastPollKey: 'cfsDlmmRangeWatchLastPoll',
            }), fk, name);
          } else if (m === 'infi' || m === 'infinity') {
            addConsumer(ensure('priceRange:infi', {
              source: 'infi',
              label: 'Pancake Infinity',
              lastPollKey: 'cfsInfiBinRangeWatchLastPoll',
            }), fk, name);
          } else {
            addConsumer(ensure('priceRange:v3', {
              source: 'v3',
              label: 'Pancake V3',
              lastPollKey: 'cfsV3RangeWatchLastPoll',
            }), fk, name);
          }
        }
      }
      if (sc.custom) {
        var steps = helper.listCheckSteps(wf);
        for (var si = 0; si < steps.length; si++) {
          var a = steps[si];
          if (!helper.sourcesFromAction(a).custom) continue;
          var sig = String(a.signalSource || 'httpPoll').toLowerCase();
          if (sig === 'websocket' || sig === 'ws') {
            var wsUrl = String(a.wsUrl || a.customUrl || '').trim();
            if (isDangerousUrl(wsUrl) || hasTemplateVars(wsUrl)) continue;
            var wk = customWsFeedKey(wsUrl, a.wsSubscribeJson);
            var wsFeed = ensure(wk, {
              source: 'customWs',
              label: 'Custom WebSocket',
              url: wsUrl,
              displayUrl: displayUrl(wsUrl),
              subscribeJson: a.wsSubscribeJson || '',
              lastPollKey: 'cfsCustomRealtimeLastPoll',
            });
            addConsumer(wsFeed, fk, name);
            addSignalConsumer(wsFeed, {
              familyId: fk,
              name: name,
              matchPath: a.wsMatchPath || '',
              matchRegex: a.wsMatchRegex || '',
              onSignalWorkflowId: a.onSignalWorkflowId || '',
              onSignalStartStepIndex: a.onSignalStartStepIndex,
            });
          } else {
            var httpUrl = String(a.customUrl || a.url || '').trim();
            if (isDangerousUrl(httpUrl) || hasTemplateVars(httpUrl)) continue;
            if (headersOversize(a.headersJson)) continue;
            var hk = customHttpFeedKey(httpUrl, a.headersJson);
            var httpFeed = ensure(hk, {
              source: 'customHttp',
              label: 'Custom HTTP',
              url: httpUrl,
              displayUrl: displayUrl(httpUrl),
              headersJson: a.headersJson || '',
              pollIntervalMs: clampCustomPollMs(a.customPollIntervalMs || a.pollIntervalMs),
              lastPollKey: 'cfsCustomRealtimeLastPoll',
            });
            if (a.customPollIntervalMs || a.pollIntervalMs) {
              httpFeed.pollIntervalMs = Math.min(
                httpFeed.pollIntervalMs || MIN_CUSTOM_POLL_MS,
                clampCustomPollMs(a.customPollIntervalMs || a.pollIntervalMs),
              );
            }
            addConsumer(httpFeed, fk, name);
            addSignalConsumer(httpFeed, {
              familyId: fk,
              name: name,
              dedupeField: a.dedupeField || '',
              payloadPath: a.payloadPath || '',
              onSignalWorkflowId: a.onSignalWorkflowId || '',
              onSignalStartStepIndex: a.onSignalStartStepIndex,
            });
          }
        }
      }
    }

    var keys = Object.keys(byKey);
    var feeds = [];
    for (var fi = 0; fi < keys.length; fi++) feeds.push(byKey[keys[fi]]);
    return feeds;
  }

  function firstProjectIdFromSteps(wf) {
    var helper = api();
    if (!helper) return '';
    var steps = helper.listCheckSteps(wf);
    for (var i = 0; i < steps.length; i++) {
      var p = String(steps[i].projectId || '').trim();
      if (p) return p;
    }
    return '';
  }

  var ANALYZE_TRIGGER_MAP = {
    selectFollowingAccount: { followingSolanaWatch: true, followingBscWatch: true },
    bindAlwaysOnBoundRow: { priceRangeWatch: true },
    pancakeV3RangeWatch: { priceRangeWatch: true, priceRangeMode: 'v3' },
    pancakeInfiBinRangeWatch: { priceRangeWatch: true, priceRangeMode: 'infi' },
    raydiumClmmRangeWatch: { priceRangeWatch: true, priceRangeMode: 'raydiumClmm' },
    meteoraDlmmRangeWatch: { priceRangeWatch: true, priceRangeMode: 'meteoraDlmm' },
    scanImportFolder: { fileWatch: true },
    waitForHttpPoll: { custom: true, signalSource: 'httpPoll' },
    asterUserStreamWait: { custom: true, signalSource: 'websocket' },
  };

  function hostLooksLikeMonitor(pageUrl) {
    var u = String(pageUrl || '').toLowerCase();
    if (!u) return '';
    if (/pulse|following|gmgn\.ai|birdeye\.so/.test(u)) return 'Following (Solana/BSC)';
    if (/raydium/.test(u) && /clmm|liquidity|portfolio|position/.test(u)) return 'Raydium CLMM';
    if (/raydium/.test(u)) return 'Raydium CLMM';
    if (/meteora/.test(u) && /dlmm|liquidity|position|pool/.test(u)) return 'Meteora DLMM';
    if (/meteora/.test(u)) return 'Meteora DLMM';
    if (/pancake|pancakeswap/.test(u) && /liquidity|v3|infinity|position|pool/.test(u)) return 'Pancake LP';
    if (/pancake|pancakeswap/.test(u)) return 'Pancake LP';
    if (/webhook|relay|alert|pipedream|hookdeck/.test(u)) return 'custom HTTP';
    return '';
  }

  /**
   * Merge checkRealtimeData into analyze output. Never append a second check step.
   * @returns {{ actions: object[], hint: string, merged: boolean }}
   */
  function mergeCheckRealtimeAfterAnalyze(actions, pageUrl) {
    if (!Array.isArray(actions)) return { actions: actions || [], hint: '', merged: false };
    var helper = api();
    var sources = emptySources();
    var extra = {};
    var found = false;
    for (var i = 0; i < actions.length; i++) {
      var t = actions[i] && actions[i].type;
      var map = ANALYZE_TRIGGER_MAP[t];
      if (!map) continue;
      found = true;
      var keys = Object.keys(map);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (key === 'priceRangeMode' || key === 'signalSource') extra[key] = map[key];
        else if (map[key]) sources[key] = true;
      }
      if (t === 'waitForHttpPoll') {
        extra.customUrl = actions[i].url || '';
        extra.headersJson = actions[i].headersJson || '';
        extra.signalSource = 'httpPoll';
      }
      if (t === 'asterUserStreamWait') {
        extra.wsUrl = actions[i].wsUrl || actions[i].userStreamUrl || '';
        extra.signalSource = 'websocket';
      }
    }
    if (!found) {
      var look = hostLooksLikeMonitor(pageUrl);
      if (look) {
        return {
          actions: actions,
          hint: 'Add Check for real-time data (' + look + ') so this can run in the background.',
          merged: false,
        };
      }
      return { actions: actions, hint: '', merged: false };
    }

    var existingIdx = -1;
    for (var ai = 0; ai < actions.length; ai++) {
      if (actions[ai] && actions[ai].type === CHECK_STEP) {
        existingIdx = ai;
        break;
      }
    }
    var step;
    var out = actions.slice();
    if (existingIdx >= 0) {
      step = Object.assign({}, out[existingIdx]);
    } else {
      step = helper && typeof helper.defaultCheckActionFromAlwaysOn === 'function'
        ? helper.defaultCheckActionFromAlwaysOn({})
        : { type: CHECK_STEP };
      step.type = CHECK_STEP;
    }
    var sk = Object.keys(sources);
    for (var si = 0; si < sk.length; si++) {
      if (sources[sk[si]]) step[sk[si]] = true;
    }
    if (extra.priceRangeMode) step.priceRangeMode = extra.priceRangeMode;
    if (extra.signalSource) step.signalSource = extra.signalSource;
    if (extra.customUrl && !step.customUrl) step.customUrl = extra.customUrl;
    if (extra.headersJson && !step.headersJson) step.headersJson = extra.headersJson;
    if (extra.wsUrl && !step.wsUrl) step.wsUrl = extra.wsUrl;

    if (existingIdx >= 0) out[existingIdx] = step;
    else out.push(step);
    return { actions: out, hint: '', merged: true };
  }

  function isMode(prw, action, names) {
    var mode = '';
    if (action && action.priceRangeMode) mode = String(action.priceRangeMode);
    else if (prw && (prw.mode || prw.watchMode)) mode = String(prw.mode || prw.watchMode);
    mode = mode.toLowerCase();
    for (var i = 0; i < names.length; i++) {
      if (mode === names[i]) return true;
    }
    return false;
  }

  function collectRangeWatchJobs(stored, kind) {
    var helper = api();
    if (!helper || typeof helper.collectLatestFamilyWorkflows !== 'function') return [];
    var members = helper && helper.collectLatestFamilyWorkflows
      ? helper.collectLatestFamilyWorkflows(stored || {})
      : [];
    var jobs = [];
    for (var i = 0; i < members.length; i++) {
      var wf = members[i].wf;
      var id = members[i].id;
      if (!helper.workflowAlwaysOnEnabled(wf)) continue;
      var sc = helper.scopesForWorkflow(wf);
      if (!sc.priceRangeWatch) continue;
      var steps = helper.listCheckSteps(wf);
      var action = null;
      for (var si = 0; si < steps.length; si++) {
        if (!helper.sourcesFromAction(steps[si]).priceRangeWatch) continue;
        action = steps[si];
        var prwTry = (wf.alwaysOn && wf.alwaysOn.priceRangeWatch) || {};
        var matchTry = kind === 'clmm'
          ? isMode(prwTry, action, ['raydiumclmm', 'raydium_clmm', 'clmm'])
          : isMode(prwTry, action, ['meteoradlmm', 'meteora_dlmm', 'dlmm']);
        if (matchTry) break;
        action = null;
      }
      var prw = (wf.alwaysOn && wf.alwaysOn.priceRangeWatch) || {};
      var match = action
        ? true
        : (kind === 'clmm'
          ? isMode(prw, steps[0] || {}, ['raydiumclmm', 'raydium_clmm', 'clmm'])
          : isMode(prw, steps[0] || {}, ['meteoradlmm', 'meteora_dlmm', 'dlmm']));
      if (!match) continue;
      var ao = wf.alwaysOn || {};
      var rows = Array.isArray(ao.boundRows) ? ao.boundRows : (ao.boundRow ? [ao.boundRow] : []);
      var positions = [];
      for (var ri = 0; ri < rows.length; ri++) {
        var r = rows[ri] || {};
        if (kind === 'clmm') {
          var poolId = String(r.poolId || r.clmmPoolId || r.v3Pool || '').trim();
          var mint = String(r.positionNftMint || r.clmmPositionNft || r.v3PositionTokenId || '').trim();
          if (poolId && mint) positions.push({ poolId: poolId, positionNftMint: mint, row: r });
        } else {
          var lbPair = String(r.lbPair || r.dlmmLbPair || r.poolId || '').trim();
          var position = String(r.position || r.dlmmPosition || r.positionNftMint || '').trim();
          if (lbPair && position) positions.push({ lbPair: lbPair, position: position, row: r });
        }
      }
      jobs.push({
        workflowId: id,
        workflowName: wf.name || id,
        positions: positions,
        priceRangeWatch: prw,
        alwaysOn: ao,
        familyId: helper.familyKey(wf, id),
      });
    }
    return jobs;
  }

  function emptySources() {
    return {
      followingSolanaWatch: false,
      followingBscWatch: false,
      followingAutomationSolana: false,
      followingAutomationBsc: false,
      fileWatch: false,
      priceRangeWatch: false,
      custom: false,
    };
  }

  global.CFS_realtimeFeeds = {
    MIN_CUSTOM_POLL_MS: MIN_CUSTOM_POLL_MS,
    MAX_PAYLOAD_CHARS: MAX_PAYLOAD_CHARS,
    MAX_HEADERS_CHARS: MAX_HEADERS_CHARS,
    fingerprint: fingerprint,
    parseHeadersJson: parseHeadersJson,
    isDangerousUrl: isDangerousUrl,
    hasTemplateVars: hasTemplateVars,
    normalizeUrlForKey: normalizeUrlForKey,
    displayUrl: displayUrl,
    customHttpFeedKey: customHttpFeedKey,
    customWsFeedKey: customWsFeedKey,
    clampCustomPollMs: clampCustomPollMs,
    capPayload: capPayload,
    collectFeeds: collectFeeds,
    collectClmmRangeJobs: function (stored) { return collectRangeWatchJobs(stored, 'clmm'); },
    collectDlmmRangeJobs: function (stored) { return collectRangeWatchJobs(stored, 'dlmm'); },
    mergeCheckRealtimeAfterAnalyze: mergeCheckRealtimeAfterAnalyze,
    hostLooksLikeMonitor: hostLooksLikeMonitor,
    headersOversize: headersOversize,
  };
})(typeof self !== 'undefined' ? self : globalThis);
