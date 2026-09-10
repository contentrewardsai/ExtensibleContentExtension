/**
 * BSC V3 always-on monitor: one-shot range classify, onOutOfRange → runWorkflow
 * migration, and SW-tick prefix planning (no tab).
 * CFS_v3MonitorSteps — SW importScripts, unit tests, side panel.
 */
(function (global) {
  'use strict';

  var CHECK_STEP = 'checkRealtimeData';
  var RANGE_STEP = 'pancakeV3RangeWatch';
  var RECONCILE_STEP = 'reconcileV3Positions';
  var RUN_WF = 'runWorkflow';
  var GAS_OP = 'ensureNativeGasFromStable';

  function getActions(wf) {
    if (!wf) return [];
    if (wf.analyzed && Array.isArray(wf.analyzed.actions)) return wf.analyzed.actions;
    if (Array.isArray(wf.actions)) return wf.actions;
    return [];
  }

  function waitUntilOutOfRangeFromAction(action) {
    var v = action && action.waitUntilOutOfRange;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  }

  function resolveNearEdgePercent(action, row, alwaysOn) {
    var raw = '';
    if (action && action.nearEdgePercent != null && String(action.nearEdgePercent).trim() !== '') {
      raw = action.nearEdgePercent;
    } else if (row && row.nearEdgePercent != null && String(row.nearEdgePercent).trim() !== '') {
      raw = row.nearEdgePercent;
    } else if (alwaysOn && alwaysOn.nearEdgePercent != null && String(alwaysOn.nearEdgePercent).trim() !== '') {
      raw = alwaysOn.nearEdgePercent;
    }
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    var n = Number(s);
    if (!(n > 0) || !Number.isFinite(n)) return null;
    return n;
  }

  function classifyTriggerFromCheck(check, nearPct) {
    if (!check) {
      return { inRange: true, triggerReason: 'in_range', driftDirection: '', nearEdge: false };
    }
    if (check.inRange === false) {
      var dir =
        check.driftDirection === 'above' || check.driftDirection === 'below'
          ? check.driftDirection
          : check.currentTick > check.tickUpper
            ? 'above'
            : 'below';
      return { inRange: false, triggerReason: 'hard_oor', driftDirection: dir, nearEdge: false };
    }
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
      return { inRange: true, triggerReason: 'near_edge', driftDirection: softDir, nearEdge: true };
    }
    return { inRange: true, triggerReason: 'in_range', driftDirection: '', nearEdge: false };
  }

  function applyRangeCheckToRow(action, row, check, classified, extra) {
    if (!row || !check) return row;
    var cl = classified || classifyTriggerFromCheck(check, null);
    var dirVar = String((action && action.saveDriftDirection) || '').trim() || 'driftDirection';
    row[dirVar] = cl.driftDirection || '';
    row.driftDirection = cl.driftDirection || '';
    row.inRange = cl.inRange === true ? 'true' : 'false';
    row.triggerReason = cl.triggerReason || '';
    row.inactive = cl.triggerReason === 'hard_oor';
    row.nearEdge = cl.nearEdge === true;
    var tickVar = String((action && action.saveCurrentTick) || '').trim() || 'currentTick';
    row[tickVar] = check.currentTick;
    row.currentTick = check.currentTick;
    row.tickLower = check.tickLower;
    row.tickUpper = check.tickUpper;
    if (check.pctToLower != null) row.pctToLower = String(check.pctToLower);
    if (check.pctToUpper != null) row.pctToUpper = String(check.pctToUpper);
    if (check.composition0 != null) row.composition0 = String(check.composition0);
    if (check.composition1 != null) row.composition1 = String(check.composition1);
    row.v3Pool = check.pool || row.v3Pool || '';
    row.token0 = check.token0 || row.token0 || '';
    row.token1 = check.token1 || row.token1 || '';
    row.v3Fee = check.fee || row.v3Fee || '';
    row.v3PositionTokenId = check.v3PositionTokenId || row.v3PositionTokenId || '';
    var rangeVar = String((action && action.savePositionRange) || '').trim();
    if (rangeVar) {
      try {
        row[rangeVar] = JSON.stringify({
          tickLower: check.tickLower,
          tickUpper: check.tickUpper,
          currentTick: check.currentTick,
          direction: cl.driftDirection || '',
          triggerReason: cl.triggerReason || '',
          pool: check.pool || '',
          token0: check.token0 || '',
          token1: check.token1 || '',
          fee: check.fee || '',
          detectedAt: new Date().toISOString(),
          pollCount: extra && extra.pollCount != null ? extra.pollCount : 1,
        });
      } catch (_) {}
    }
    return row;
  }

  function seedTickRow(positionRow, check, alwaysOn, classified) {
    var ao = alwaysOn || {};
    var row = Object.assign({}, positionRow || {});
    var gasOn = ao.gasReloadEnabled === true || ao.gasReloadEnabled === 'true';
    row.gasReloadEnabled = gasOn ? 'true' : 'false';
    row.gasReloadBelowWei = ao.gasReloadBelowWei != null ? String(ao.gasReloadBelowWei) : row.gasReloadBelowWei || '';
    row.gasReloadTargetWei = ao.gasReloadTargetWei != null ? String(ao.gasReloadTargetWei) : row.gasReloadTargetWei || '';
    row.stableReserveWei = ao.stableReserveWei != null ? String(ao.stableReserveWei) : row.stableReserveWei || '';
    row.gasReloadStableToken = ao.gasReloadStableToken || ao.stableToken || row.stableToken || '';
    if (check) applyRangeCheckToRow({ saveDriftDirection: 'driftDirection', saveCurrentTick: 'currentTick' }, row, check, classified, null);
    return row;
  }

  function collectRunWorkflowChildren(actions) {
    var out = [];
    var list = Array.isArray(actions) ? actions : [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || a.type !== RUN_WF) continue;
      var id = String(a.workflowId || '').trim();
      if (!id) continue;
      out.push({
        workflowId: id,
        runIf: a.runIf || '',
        rowMapping: a.rowMapping,
        startStepIndex: a.startStepIndex,
        playbackStartUrl: a.playbackStartUrl,
      });
    }
    return out;
  }

  function hasMatchingRunWorkflowChildren(wf) {
    return collectRunWorkflowChildren(getActions(wf)).length > 0;
  }

  function migrateOnOutOfRangeToRunWorkflowSteps(wf) {
    if (!wf || typeof wf !== 'object') return { migrated: false, reason: 'no_wf', added: 0 };
    if (hasMatchingRunWorkflowChildren(wf)) {
      return { migrated: false, reason: 'has_runWorkflow', added: 0 };
    }
    var rules =
      wf.alwaysOn && wf.alwaysOn.priceRangeWatch && Array.isArray(wf.alwaysOn.priceRangeWatch.onOutOfRange)
        ? wf.alwaysOn.priceRangeWatch.onOutOfRange
        : [];
    if (!rules.length) return { migrated: false, reason: 'no_rules', added: 0 };
    if (!wf.analyzed || typeof wf.analyzed !== 'object') wf.analyzed = {};
    if (!Array.isArray(wf.analyzed.actions)) wf.analyzed.actions = [];
    var added = 0;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule || !rule.workflowId) continue;
      var step = { type: RUN_WF, workflowId: String(rule.workflowId).trim() };
      if (rule.runIf) step.runIf = rule.runIf;
      else step.runIf = '';
      if (rule.rowMapping) step.rowMapping = rule.rowMapping;
      if (rule.startStepIndex != null) step.startStepIndex = rule.startStepIndex;
      if (rule.playbackStartUrl) step.playbackStartUrl = rule.playbackStartUrl;
      wf.analyzed.actions.push(step);
      added++;
    }
    return { migrated: added > 0, reason: added ? 'compiled' : 'empty_rules', added: added };
  }

  function isGasTickAction(action) {
    return !!(
      action &&
      action.type === 'bscPancake' &&
      String(action.operation || '').trim() === GAS_OP
    );
  }

  function isSwTickSafeAction(action) {
    if (!action || !action.type) return false;
    var t = action.type;
    if (t === CHECK_STEP) return true;
    if (t === RANGE_STEP) return true;
    if (t === RECONCILE_STEP) return true;
    if (t === RUN_WF) return true;
    if (isGasTickAction(action)) return true;
    return false;
  }

  /**
   * Plan a SW tick over monitor steps. Never starts at checkRealtimeData.
   * Tab-only prefix steps are skipped (fail-closed — no hidden tab).
   * runWorkflow children with matching runIf are returned for a tab start.
   */
  function planMonitorTick(actions, row, evaluateRunIf) {
    var evalFn =
      typeof evaluateRunIf === 'function'
        ? evaluateRunIf
        : function (runIf) {
            return !String(runIf || '').trim();
          };
    var prefix = [];
    var children = [];
    var skipped = [];
    var list = Array.isArray(actions) ? actions : [];
    for (var i = 0; i < list.length; i++) {
      var action = list[i];
      if (!action || !action.type) continue;
      if (!evalFn(action.runIf, row || {})) continue;
      if (action.type === CHECK_STEP) {
        skipped.push({ type: CHECK_STEP, reason: 'feed_already_running', index: i });
        continue;
      }
      if (action.type === RANGE_STEP) {
        prefix.push({ kind: 'range', action: action, index: i });
        continue;
      }
      if (isGasTickAction(action)) {
        prefix.push({ kind: 'gas', action: action, index: i });
        continue;
      }
      if (action.type === RECONCILE_STEP) {
        prefix.push({ kind: 'reconcile', action: action, index: i });
        continue;
      }
      if (action.type === RUN_WF) {
        var wid = String(action.workflowId || '').trim();
        if (wid) children.push({ kind: 'runWorkflow', action: action, workflowId: wid, index: i });
        continue;
      }
      skipped.push({ type: action.type, reason: 'tab_only_prefix', index: i });
    }
    return {
      prefix: prefix,
      children: children,
      skipped: skipped,
      openTab: children.length > 0,
    };
  }

  function hasGasPrefixStep(actions) {
    var list = Array.isArray(actions) ? actions : [];
    for (var i = 0; i < list.length; i++) {
      if (isGasTickAction(list[i])) return true;
    }
    return false;
  }

  function hasReconcilePrefixStep(actions) {
    var list = Array.isArray(actions) ? actions : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].type === RECONCILE_STEP) return true;
    }
    return false;
  }

  function isV3AlwaysOnMonitor(wf) {
    if (!wf || typeof wf !== 'object' || wf._testOnly) return false;
    var ao = wf.alwaysOn && typeof wf.alwaysOn === 'object' ? wf.alwaysOn : {};
    var prw = ao.priceRangeWatch;
    var mode = String((prw && (prw.mode || prw.watchMode)) || '').toLowerCase();
    if (mode === 'infi' || mode === 'infinity') return false;
    var actions = getActions(wf);
    var hasRange = false;
    var hasCheckPrw = false;
    var hasInfiWatch = false;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (!a) continue;
      if (a.type === RANGE_STEP) hasRange = true;
      if (a.type === 'pancakeInfiBinRangeWatch') hasInfiWatch = true;
      if (a.type === CHECK_STEP) {
        if (a.priceRangeWatch === true || a.priceRangeWatch === 'true') hasCheckPrw = true;
        if (String(a.priceRangeMode || '').toLowerCase() === 'v3') hasCheckPrw = true;
      }
    }
    if (hasInfiWatch && !hasRange) return false;
    if (mode === 'v3' || mode === 'pancake_v3') return true;
    if (hasRange && (hasCheckPrw || (ao.scopes && ao.scopes.priceRangeWatch))) return true;
    return false;
  }

  function defaultCheckRealtimeDataStep(pollMs) {
    return {
      type: CHECK_STEP,
      runIf: '',
      alwaysOnEnabled: true,
      priceRangeWatch: true,
      priceRangeMode: 'v3',
      pollIntervalMs: pollMs || 30000,
      followingSolanaWatch: false,
      followingBscWatch: false,
      followingAutomationSolana: false,
      followingAutomationBsc: false,
      fileWatch: false,
      custom: false,
    };
  }

  function defaultGasTickStep() {
    return {
      type: 'bscPancake',
      runIf: '{{gasReloadEnabled}} === true',
      operation: GAS_OP,
      gasReloadBelowWei: '{{gasReloadBelowWei}}',
      gasReloadTargetWei: '{{gasReloadTargetWei}}',
      gasReloadStableToken: '{{stableToken}}',
      stableReserveWei: '{{stableReserveWei}}',
      waitConfirmations: 1,
    };
  }

  function defaultReconcileStep(wfId) {
    return {
      type: RECONCILE_STEP,
      runIf: '',
      workflowId: String(wfId || 'wf-bsc-v3-monitor').trim() || 'wf-bsc-v3-monitor',
      autoTrackNew: false,
      everyNTicks: 10,
      saveResultVariable: 'v3ReconcileResult',
    };
  }

  function defaultRangeWatchStep(pollMs) {
    return {
      type: RANGE_STEP,
      runIf: '',
      v3PositionTokenId: '{{v3PositionTokenId}}',
      pollIntervalMs: pollMs || 30000,
      timeoutMs: 0,
      waitUntilOutOfRange: false,
      saveDriftDirection: 'driftDirection',
      saveCurrentTick: 'currentTick',
      savePositionRange: 'positionRange',
    };
  }

  /**
   * Upgrade Library copies of the V3 monitor (no preset reload): insert
   * checkRealtimeData / gas / reconcile if missing, and force one-shot range.
   * Idempotent. Skips Infinity and non-always-on workflows.
   */
  function migrateStoredV3MonitorPrefix(wf) {
    if (!isV3AlwaysOnMonitor(wf)) return { migrated: false, reason: 'not_v3_monitor', changes: [] };
    if (!wf.analyzed || typeof wf.analyzed !== 'object') wf.analyzed = {};
    if (!Array.isArray(wf.analyzed.actions)) {
      wf.analyzed.actions = Array.isArray(wf.actions) ? wf.actions.slice() : [];
    }
    var actions = wf.analyzed.actions;
    var changes = [];
    var pollMs = (wf.alwaysOn && wf.alwaysOn.pollIntervalMs) || 30000;
    var checkIdx = -1;
    var rangeIdx = -1;
    var i;
    for (i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].type === CHECK_STEP && checkIdx < 0) checkIdx = i;
      if (actions[i] && actions[i].type === RANGE_STEP && rangeIdx < 0) rangeIdx = i;
    }
    if (checkIdx < 0) {
      var check = defaultCheckRealtimeDataStep(pollMs);
      if (wf.alwaysOn && wf.alwaysOn.enabled === false) check.alwaysOnEnabled = false;
      actions.splice(0, 0, check);
      checkIdx = 0;
      if (rangeIdx >= 0) rangeIdx += 1;
      changes.push('checkRealtimeData');
    } else {
      var chk = actions[checkIdx];
      if (!(chk.priceRangeWatch === true || chk.priceRangeWatch === 'true')) {
        chk.priceRangeWatch = true;
        changes.push('checkRealtimeData.priceRangeWatch');
      }
      if (!String(chk.priceRangeMode || '').trim()) {
        chk.priceRangeMode = 'v3';
        changes.push('checkRealtimeData.priceRangeMode');
      }
    }
    if (!hasGasPrefixStep(actions)) {
      var gasAt = checkIdx + 1;
      actions.splice(gasAt, 0, defaultGasTickStep());
      if (rangeIdx >= gasAt) rangeIdx += 1;
      changes.push('ensureNativeGasFromStable');
    }
    if (!hasReconcilePrefixStep(actions)) {
      var recAt = checkIdx + 1;
      for (i = 0; i < actions.length; i++) {
        if (isGasTickAction(actions[i])) recAt = i + 1;
      }
      actions.splice(recAt, 0, defaultReconcileStep(wf.id));
      if (rangeIdx >= recAt) rangeIdx += 1;
      changes.push('reconcileV3Positions');
    }
    if (rangeIdx < 0) {
      var rwAt = actions.length;
      for (i = 0; i < actions.length; i++) {
        if (actions[i] && actions[i].type === RUN_WF) {
          rwAt = i;
          break;
        }
      }
      actions.splice(rwAt, 0, defaultRangeWatchStep(pollMs));
      changes.push('pancakeV3RangeWatch');
    }
    for (i = 0; i < actions.length; i++) {
      var ra = actions[i];
      if (!ra || ra.type !== RANGE_STEP) continue;
      if (ra.waitUntilOutOfRange === false || ra.waitUntilOutOfRange === 'false') continue;
      ra.waitUntilOutOfRange = false;
      changes.push('waitUntilOutOfRange');
    }
    return {
      migrated: changes.length > 0,
      reason: changes.length ? 'upgraded' : 'already_current',
      changes: changes,
    };
  }

  function familyMemberIds(wfs, id, wf) {
    var family = wf && wf.initial_version ? String(wf.initial_version) : String(id || '');
    var out = [];
    var seen = Object.create(null);
    function add(x) {
      var s = String(x || '').trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    }
    add(id);
    add(family);
    if (wfs && typeof wfs === 'object') {
      var keys = Object.keys(wfs);
      for (var i = 0; i < keys.length; i++) {
        var wid = keys[i];
        var w = wfs[wid];
        if (!w || typeof w !== 'object' || w._testOnly) continue;
        var fk = w.initial_version ? String(w.initial_version) : String(wid);
        if (fk === family) add(wid);
      }
    }
    return out;
  }

  function lastActivityForFamily(activity, memberIds) {
    var set = Object.create(null);
    var ids = Array.isArray(memberIds) ? memberIds : [];
    for (var i = 0; i < ids.length; i++) set[String(ids[i])] = true;
    var list = Array.isArray(activity) ? activity : [];
    for (var a = 0; a < list.length; a++) {
      var e = list[a];
      if (!e || typeof e !== 'object') continue;
      var parent = e.workflowId != null ? String(e.workflowId) : '';
      if (!parent || !set[parent]) continue;
      if (
        e.childWorkflowId ||
        e.kind === 'oor_trigger' ||
        e.kind === 'near_edge_trigger' ||
        e.kind === 'monitor_child'
      ) {
        return e;
      }
    }
    return null;
  }

  function lastPollHitForWorkflow(lastPoll, workflowId) {
    if (!lastPoll || typeof lastPoll !== 'object') return null;
    var id = String(workflowId || '');
    var results = Array.isArray(lastPoll.results) ? lastPoll.results : [];
    for (var i = 0; i < results.length; i++) {
      if (results[i] && String(results[i].workflowId || '') === id) return results[i];
    }
    if (!results.length && (lastPoll.idle === true || lastPoll.ok === false)) {
      return {
        ts: lastPoll.ts,
        ok: lastPoll.ok,
        idle: lastPoll.idle,
        reason: lastPoll.reason,
        error: lastPoll.error,
      };
    }
    return null;
  }

  function positionStatusFromLastPoll(lastPoll, workflowId, tokenId) {
    var tid = String(tokenId || '').trim();
    var empty = { status: '', lastTickTs: null, inRange: null, cls: '', triggerReason: '' };
    if (!lastPoll || typeof lastPoll !== 'object' || !tid) return empty;
    var ts = lastPoll.ts != null ? lastPoll.ts : null;
    var hit = lastPollHitForWorkflow(lastPoll, workflowId);
    if (!hit) return { status: '', lastTickTs: ts, inRange: null, cls: '', triggerReason: '' };
    if (hit.idle) return { status: 'idle', lastTickTs: ts, inRange: null, cls: '', triggerReason: '' };
    var posList = Array.isArray(hit.results) ? hit.results : [];
    var pos = null;
    for (var p = 0; p < posList.length; p++) {
      if (posList[p] && String(posList[p].v3PositionTokenId || '').trim() === tid) {
        pos = posList[p];
        break;
      }
    }
    if (!pos) return { status: '', lastTickTs: ts, inRange: null, cls: '', triggerReason: '' };
    if (pos.closed) return { status: 'closed', lastTickTs: ts, inRange: null, cls: '', triggerReason: '' };
    if (pos.ok === false || pos.error) {
      return { status: 'error', lastTickTs: ts, inRange: null, cls: 'is-error', triggerReason: '' };
    }
    if (pos.nearEdge === true || pos.triggerReason === 'near_edge') {
      return { status: 'near edge', lastTickTs: ts, inRange: true, cls: 'is-error', triggerReason: 'near_edge' };
    }
    if (pos.inRange === false || pos.inactive === true || pos.triggerReason === 'hard_oor') {
      return { status: 'Inactive (OUT)', lastTickTs: ts, inRange: false, cls: 'is-error', triggerReason: 'hard_oor' };
    }
    if (pos.inRange === true) {
      return { status: 'in range', lastTickTs: ts, inRange: true, cls: 'is-ok', triggerReason: 'in_range' };
    }
    return { status: '', lastTickTs: ts, inRange: null, cls: '', triggerReason: '' };
  }

  var BOUND_ROW_DATA_KEYS = [
    { rowKey: 'v3PositionTokenId', label: 'NFT id' },
    { rowKey: 'enabled', label: 'enabled' },
    { rowKey: 'exitBelowPolicy', label: 'exitBelowPolicy' },
    { rowKey: 'exitAbovePolicy', label: 'exitAbovePolicy' },
    { rowKey: 'fundMode', label: 'fundMode' },
    { rowKey: 'rangePercentBelow', label: 'rangePercentBelow' },
    { rowKey: 'rangePercentAbove', label: 'rangePercentAbove' },
    { rowKey: 'rangePercent', label: 'rangePercent' },
    { rowKey: 'stableToken', label: 'stableToken' },
    { rowKey: 'v3Pool', label: 'v3Pool' },
    { rowKey: 'nearEdgePercent', label: 'nearEdgePercent' },
  ];

  function boundRowDataKeys(wf) {
    var keys = BOUND_ROW_DATA_KEYS.slice();
    var seen = Object.create(null);
    for (var i = 0; i < keys.length; i++) seen[keys[i].rowKey] = true;
    var actions = getActions(wf);
    for (var a = 0; a < actions.length; a++) {
      var act = actions[a];
      if (!act || act.type !== 'bindAlwaysOnBoundRow' || !act.fieldMap || typeof act.fieldMap !== 'object') continue;
      var fmKeys = Object.keys(act.fieldMap);
      for (var k = 0; k < fmKeys.length; k++) {
        var rk = String(fmKeys[k] || '').trim();
        if (!rk || seen[rk]) continue;
        seen[rk] = true;
        keys.push({ rowKey: rk, label: rk });
      }
    }
    return keys;
  }

  var api = {
    waitUntilOutOfRangeFromAction: waitUntilOutOfRangeFromAction,
    resolveNearEdgePercent: resolveNearEdgePercent,
    classifyTriggerFromCheck: classifyTriggerFromCheck,
    applyRangeCheckToRow: applyRangeCheckToRow,
    seedTickRow: seedTickRow,
    collectRunWorkflowChildren: collectRunWorkflowChildren,
    hasMatchingRunWorkflowChildren: hasMatchingRunWorkflowChildren,
    migrateOnOutOfRangeToRunWorkflowSteps: migrateOnOutOfRangeToRunWorkflowSteps,
    isGasTickAction: isGasTickAction,
    isSwTickSafeAction: isSwTickSafeAction,
    planMonitorTick: planMonitorTick,
    hasGasPrefixStep: hasGasPrefixStep,
    hasReconcilePrefixStep: hasReconcilePrefixStep,
    isV3AlwaysOnMonitor: isV3AlwaysOnMonitor,
    migrateStoredV3MonitorPrefix: migrateStoredV3MonitorPrefix,
    familyMemberIds: familyMemberIds,
    lastActivityForFamily: lastActivityForFamily,
    lastPollHitForWorkflow: lastPollHitForWorkflow,
    positionStatusFromLastPoll: positionStatusFromLastPoll,
    boundRowDataKeys: boundRowDataKeys,
    getActions: getActions,
    CHECK_STEP: CHECK_STEP,
    RANGE_STEP: RANGE_STEP,
    RECONCILE_STEP: RECONCILE_STEP,
  };

  global.CFS_v3MonitorSteps = api;
  global.__CFS_v3MonitorSteps = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window);
