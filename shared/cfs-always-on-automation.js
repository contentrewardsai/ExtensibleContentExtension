/**
 * Following / Pulse: workflow gate + always-on (background) scopes.
 * Loaded in MV3 service worker via importScripts before solana-watch.js / bsc-watch.js.
 *
 * Source of truth for always-on is checkRealtimeData steps. Derived alwaysOn
 * is written onto the workflow object (merge, never replace boundRows).
 *
 * Exposes on globalThis:
 * - __CFS_evaluateFollowingAutomation(stored) → gate object for Solana/BSC watch and Following automation
 * - __CFS_alwaysOnFromSteps — derive / migrate / family collect helpers
 */
(function (global) {
  'use strict';

  var WORKFLOWS_KEY = 'workflows';
  var SOL_BUNDLE_KEY = 'cfsPulseSolanaWatchBundle';
  var BSC_BUNDLE_KEY = 'cfsPulseBscWatchBundle';
  var BSC_API_KEY = 'cfs_bscscan_api_key';
  var HIDE_E2E_KEY = 'cfsHideE2eTestingWorkflows';
  var CHECK_STEP = 'checkRealtimeData';

  var SCOPE_KEYS = [
    'followingSolanaWatch',
    'followingBscWatch',
    'followingAutomationSolana',
    'followingAutomationBsc',
    'fileWatch',
    'priceRangeWatch',
    'custom',
  ];

  var FOLLOWING_AUTOMATION_KEYS = [
    'automationEnabled',
    'paperMode',
    'jupiterWrapAndUnwrapSol',
    'autoExecuteSwaps',
    'sizeMode',
    'quoteMint',
    'proportionalScalePercent',
    'fixedAmountRaw',
    'usdAmount',
    'slippageBps',
  ];

  var ALWAYS_ON_PRESERVE_KEYS = [
    'boundRows',
    'boundRow',
    'priceRangeWatch',
    'gasReloadEnabled',
    'gasReloadBelowWei',
    'gasReloadTargetWei',
    'gasReloadStableToken',
    'stableReserveWei',
    'gasReloadStableReserveWei',
    'nearEdgePercent',
    'reconcileAutoTrackNew',
    'projectId',
    'pollIntervalMs',
  ];

  function countBundleAddresses(bundle) {
    if (!bundle || !Array.isArray(bundle.entries)) return 0;
    var n = 0;
    for (var i = 0; i < bundle.entries.length; i++) {
      if ((bundle.entries[i].address || '').trim()) n++;
    }
    return n;
  }

  /** True if any Following BSC indexer credential is configured (QuickNode / Etherscan / Ankr / Covalent). */
  function hasBscIndexerCredential(stored) {
    var idx = global.CFS_BSC_INDEXER;
    if (idx && typeof idx.hasAnyIndexerCredential === 'function') {
      return idx.hasAnyIndexerCredential(stored || {});
    }
    return !!(stored && String(stored[BSC_API_KEY] || '').trim());
  }

  function hasAnyWorkflows(stored) {
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
    return Object.keys(w).length > 0;
  }

  function sourceTruthy(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  function emptyScopes() {
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

  function getWorkflowActions(wf) {
    if (!wf) return [];
    if (wf.analyzed && Array.isArray(wf.analyzed.actions)) return wf.analyzed.actions;
    if (Array.isArray(wf.actions)) return wf.actions;
    return [];
  }

  function ensureWorkflowActions(wf) {
    if (!wf.analyzed || typeof wf.analyzed !== 'object') wf.analyzed = {};
    if (!Array.isArray(wf.analyzed.actions)) wf.analyzed.actions = [];
    return wf.analyzed.actions;
  }

  function listCheckSteps(wf) {
    var actions = getWorkflowActions(wf);
    var out = [];
    for (var i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].type === CHECK_STEP) out.push(actions[i]);
    }
    return out;
  }

  function sourcesFromAction(action) {
    var a = action || {};
    return {
      followingSolanaWatch: sourceTruthy(a.followingSolanaWatch),
      followingBscWatch: sourceTruthy(a.followingBscWatch),
      followingAutomationSolana: sourceTruthy(a.followingAutomationSolana),
      followingAutomationBsc: sourceTruthy(a.followingAutomationBsc),
      fileWatch: sourceTruthy(a.fileWatch),
      priceRangeWatch: sourceTruthy(a.priceRangeWatch),
      custom: sourceTruthy(a.custom),
    };
  }

  function anySourceOn(sources) {
    var sc = sources || emptyScopes();
    for (var i = 0; i < SCOPE_KEYS.length; i++) {
      if (sc[SCOPE_KEYS[i]]) return true;
    }
    return false;
  }

  /** Missing alwaysOnEnabled means on (older workflows). Explicit false pauses without clearing sources. */
  function checkStepSwitchOn(action) {
    if (!action || typeof action !== 'object') return true;
    var v = action.alwaysOnEnabled;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  }

  function checkStepArmed(action) {
    return checkStepSwitchOn(action) && anySourceOn(sourcesFromAction(action));
  }

  function setCheckStepsAlwaysOnEnabled(wf, on) {
    if (!wf || typeof wf !== 'object') return wf;
    var steps = listCheckSteps(wf);
    var val = on !== false;
    if (steps.length) {
      for (var i = 0; i < steps.length; i++) {
        steps[i].alwaysOnEnabled = val;
      }
    } else if (!wf.alwaysOn || typeof wf.alwaysOn !== 'object' || Array.isArray(wf.alwaysOn)) {
      wf.alwaysOn = { enabled: val, scopes: emptyScopes(), conditions: {} };
    } else {
      wf.alwaysOn.enabled = val;
    }
    applyDerivedAlwaysOn(wf);
    return wf;
  }

  function workflowHasRealtimeSources(wf) {
    var steps = listCheckSteps(wf);
    if (steps.length) {
      for (var i = 0; i < steps.length; i++) {
        if (anySourceOn(sourcesFromAction(steps[i]))) return true;
      }
      return false;
    }
    return anySourceOn((wf && wf.alwaysOn && wf.alwaysOn.scopes) || emptyScopes());
  }

  function orScopes(into, extra) {
    for (var i = 0; i < SCOPE_KEYS.length; i++) {
      var k = SCOPE_KEYS[i];
      if (extra[k]) into[k] = true;
    }
    return into;
  }

  function orScopesFromSteps(wf) {
    var steps = listCheckSteps(wf);
    var sc = emptyScopes();
    for (var i = 0; i < steps.length; i++) orScopes(sc, sourcesFromAction(steps[i]));
    return sc;
  }

  function conditionsFromSteps(wf) {
    var steps = listCheckSteps(wf);
    var out = {
      requireNonEmptyFollowingBundle: false,
      requireBscScanKeyForBsc: false,
    };
    for (var i = 0; i < steps.length; i++) {
      var a = steps[i];
      if (sourceTruthy(a.requireNonEmptyFollowingBundle)) out.requireNonEmptyFollowingBundle = true;
      if (sourceTruthy(a.requireBscScanKeyForBsc)) out.requireBscScanKeyForBsc = true;
    }
    return out;
  }

  function firstNonEmpty(steps, key) {
    for (var i = 0; i < steps.length; i++) {
      var v = steps[i][key];
      if (v != null && String(v).trim() !== '') return typeof v === 'number' ? v : String(v).trim();
    }
    return '';
  }

  function minPositivePollMs(steps) {
    var min = 0;
    for (var i = 0; i < steps.length; i++) {
      var n = parseInt(steps[i].pollIntervalMs, 10);
      if (Number.isFinite(n) && n > 0) {
        if (!min || n < min) min = n;
      }
    }
    return min;
  }

  function followingAutomationFromSteps(wf) {
    var steps = listCheckSteps(wf);
    for (var i = 0; i < steps.length; i++) {
      var a = steps[i];
      var sc = sourcesFromAction(a);
      if (!sc.followingAutomationSolana && !sc.followingAutomationBsc) continue;
      var out = {};
      var has = false;
      for (var k = 0; k < FOLLOWING_AUTOMATION_KEYS.length; k++) {
        var key = FOLLOWING_AUTOMATION_KEYS[k];
        if (a[key] !== undefined && a[key] !== '') {
          out[key] = a[key];
          has = true;
        }
      }
      if (has) return out;
    }
    return null;
  }

  function workflowAlwaysOnEnabled(wf) {
    var steps = listCheckSteps(wf);
    if (steps.length) {
      for (var i = 0; i < steps.length; i++) {
        if (checkStepArmed(steps[i])) return true;
      }
      return false;
    }
    return !!(wf && wf.alwaysOn && wf.alwaysOn.enabled === true);
  }

  function scopesForWorkflow(wf) {
    var steps = listCheckSteps(wf);
    if (steps.length) return orScopesFromSteps(wf);
    return (wf && wf.alwaysOn && wf.alwaysOn.scopes) || emptyScopes();
  }

  function conditionsForWorkflow(wf) {
    var steps = listCheckSteps(wf);
    if (steps.length) return conditionsFromSteps(wf);
    return (wf && wf.alwaysOn && wf.alwaysOn.conditions) || {};
  }

  function shouldSkipTestWorkflow(wf, stored) {
    var nav = global.CFS_navWorkflowFilter;
    if (!nav) {
      if (wf && wf._testOnly) return true;
      return false;
    }
    if (wf && wf._testOnly) return true;
    var hide = stored ? stored[HIDE_E2E_KEY] : undefined;
    return nav.isHiddenFromUserNav(wf, hide);
  }

  function familyKey(wf, id) {
    if (wf && wf.initial_version) return String(wf.initial_version);
    return String(id || '');
  }

  function workflowVersionNum(wf) {
    var n = parseInt(wf && wf.version, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /**
   * Latest version per initial_version family. Skips _testOnly and (when hide-E2E is on) test-named workflows.
   * @returns {{ id: string, wf: object }[]}
   */
  function collectLatestFamilyWorkflows(stored) {
    var w = stored && stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return [];
    var ids = Object.keys(w);
    var best = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var wf = w[id];
      if (!wf || typeof wf !== 'object') continue;
      if (shouldSkipTestWorkflow(wf, stored)) continue;
      var fk = familyKey(wf, id);
      var ver = workflowVersionNum(wf);
      var prev = best[fk];
      if (!prev || ver >= prev.version) {
        best[fk] = { id: id, wf: wf, version: ver };
      }
    }
    var out = [];
    var keys = Object.keys(best);
    for (var j = 0; j < keys.length; j++) out.push({ id: best[keys[j]].id, wf: best[keys[j]].wf });
    return out;
  }

  function applyDerivedAlwaysOn(wf) {
    if (!wf || typeof wf !== 'object') return wf;
    var steps = listCheckSteps(wf);
    var hasSteps = steps.length > 0;
    var sc = hasSteps ? orScopesFromSteps(wf) : emptyScopes();
    var enabled = hasSteps
      ? workflowAlwaysOnEnabled(wf)
      : !!(wf.alwaysOn && wf.alwaysOn.enabled === true);
    if (!hasSteps && !enabled) {
      if (wf.alwaysOn && typeof wf.alwaysOn === 'object') wf.alwaysOn.enabled = false;
      return wf;
    }

    if (!wf.alwaysOn || typeof wf.alwaysOn !== 'object' || Array.isArray(wf.alwaysOn)) {
      wf.alwaysOn = {};
    }
    var ao = wf.alwaysOn;
    ao.enabled = enabled;
    if (!ao.scopes || typeof ao.scopes !== 'object') ao.scopes = emptyScopes();
    if (hasSteps) {
      for (var i = 0; i < SCOPE_KEYS.length; i++) {
        ao.scopes[SCOPE_KEYS[i]] = !!sc[SCOPE_KEYS[i]];
      }
      var cond = conditionsFromSteps(wf);
      if (!ao.conditions || typeof ao.conditions !== 'object') ao.conditions = {};
      ao.conditions.requireNonEmptyFollowingBundle = !!cond.requireNonEmptyFollowingBundle;
      ao.conditions.requireBscScanKeyForBsc = !!cond.requireBscScanKeyForBsc;

      var projectId = firstNonEmpty(steps, 'projectId');
      if (projectId) ao.projectId = projectId;
      var poll = minPositivePollMs(steps);
      if (poll) ao.pollIntervalMs = poll;

      var mode = firstNonEmpty(steps, 'priceRangeMode');
      if (mode && sc.priceRangeWatch) {
        if (!ao.priceRangeWatch || typeof ao.priceRangeWatch !== 'object') ao.priceRangeWatch = {};
        ao.priceRangeWatch.mode = String(mode);
      }

      var fa = followingAutomationFromSteps(wf);
      if (fa) {
        if (!wf.followingAutomation || typeof wf.followingAutomation !== 'object') wf.followingAutomation = {};
        for (var k = 0; k < FOLLOWING_AUTOMATION_KEYS.length; k++) {
          var key = FOLLOWING_AUTOMATION_KEYS[k];
          if (fa[key] !== undefined) wf.followingAutomation[key] = fa[key];
        }
      } else if (!sc.followingAutomationSolana && !sc.followingAutomationBsc && wf.followingAutomation) {
        /* keep existing policy object; do not delete — user may re-enable */
      }
    }
    return wf;
  }

  function defaultCheckActionFromAlwaysOn(wf) {
    var ao = (wf && wf.alwaysOn) || {};
    var sc = ao.scopes || {};
    var c = ao.conditions || {};
    var prw = ao.priceRangeWatch && typeof ao.priceRangeWatch === 'object' ? ao.priceRangeWatch : {};
    var fa = (wf && wf.followingAutomation) || {};
    var action = {
      type: CHECK_STEP,
      alwaysOnEnabled: true,
      followingSolanaWatch: !!sc.followingSolanaWatch,
      followingBscWatch: !!sc.followingBscWatch,
      followingAutomationSolana: !!sc.followingAutomationSolana,
      followingAutomationBsc: !!sc.followingAutomationBsc,
      fileWatch: !!sc.fileWatch,
      priceRangeWatch: !!sc.priceRangeWatch,
      custom: !!sc.custom,
      requireNonEmptyFollowingBundle: !!c.requireNonEmptyFollowingBundle,
      requireBscScanKeyForBsc: !!c.requireBscScanKeyForBsc,
      projectId: ao.projectId ? String(ao.projectId) : '',
      pollIntervalMs: ao.pollIntervalMs || 0,
      priceRangeMode: prw.mode ? String(prw.mode) : 'v3',
      signalSource: 'httpPoll',
      customUrl: '',
      headersJson: '',
      customPollIntervalMs: 30000,
      dedupeField: '',
      payloadPath: '',
      wsUrl: '',
      wsSubscribeJson: '',
      wsMatchPath: '',
      wsMatchRegex: '',
      onSignalWorkflowId: '',
      onSignalStartStepIndex: '',
      saveResultVariable: '',
    };
    for (var k = 0; k < FOLLOWING_AUTOMATION_KEYS.length; k++) {
      var key = FOLLOWING_AUTOMATION_KEYS[k];
      if (fa[key] !== undefined) action[key] = fa[key];
    }
    return action;
  }

  function migrateLegacyAlwaysOnToStep(wf) {
    if (!wf || typeof wf !== 'object') return false;
    if (!wf.alwaysOn || wf.alwaysOn.enabled !== true) return false;
    if (listCheckSteps(wf).length) return false;
    var actions = ensureWorkflowActions(wf);
    actions.unshift(defaultCheckActionFromAlwaysOn(wf));
    applyDerivedAlwaysOn(wf);
    return true;
  }

  function migrateWorkflowsAlwaysOnToSteps(workflows) {
    if (!workflows || typeof workflows !== 'object' || Array.isArray(workflows)) {
      return { changed: false, count: 0 };
    }
    var ids = Object.keys(workflows);
    var count = 0;
    for (var i = 0; i < ids.length; i++) {
      var wf = workflows[ids[i]];
      if (migrateLegacyAlwaysOnToStep(wf)) count++;
      else applyDerivedAlwaysOn(wf);
    }
    return { changed: count > 0, count: count };
  }

  function findOrCreateCheckStep(wf) {
    var steps = listCheckSteps(wf);
    if (steps.length) return steps[0];
    var actions = ensureWorkflowActions(wf);
    var action = defaultCheckActionFromAlwaysOn(wf);
    if (!anySourceOn(sourcesFromAction(action))) {
      action = {
        type: CHECK_STEP,
        alwaysOnEnabled: true,
        followingSolanaWatch: false,
        followingBscWatch: false,
        followingAutomationSolana: false,
        followingAutomationBsc: false,
        fileWatch: false,
        priceRangeWatch: false,
        custom: false,
        requireNonEmptyFollowingBundle: false,
        requireBscScanKeyForBsc: false,
        projectId: '',
        pollIntervalMs: 0,
        priceRangeMode: 'v3',
        signalSource: 'httpPoll',
        customUrl: '',
        headersJson: '',
        customPollIntervalMs: 30000,
        saveResultVariable: '',
      };
    }
    actions.unshift(action);
    return action;
  }

  function upsertCheckRealtimeSource(wf, sourceKey, extra) {
    if (!wf || typeof wf !== 'object') return wf;
    extra = extra || {};
    var action = findOrCreateCheckStep(wf);
    if (SCOPE_KEYS.indexOf(sourceKey) >= 0) action[sourceKey] = true;
    if (extra.projectId != null) action.projectId = String(extra.projectId);
    if (extra.pollIntervalMs != null) {
      var n = parseInt(extra.pollIntervalMs, 10);
      if (Number.isFinite(n) && n > 0) action.pollIntervalMs = n;
    }
    if (extra.priceRangeMode) action.priceRangeMode = String(extra.priceRangeMode);
    applyDerivedAlwaysOn(wf);
    return wf;
  }

  function anyWorkflowHasAlwaysOnEnabled(stored) {
    var members = collectLatestFamilyWorkflows(stored);
    if (!members.length) {
      var w = stored[WORKFLOWS_KEY];
      if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
      var ids = Object.keys(w);
      for (var i = 0; i < ids.length; i++) {
        if (workflowAlwaysOnEnabled(w[ids[i]])) return true;
      }
      return false;
    }
    for (var j = 0; j < members.length; j++) {
      if (workflowAlwaysOnEnabled(members[j].wf)) return true;
    }
    return false;
  }

  /**
   * Union scopes from latest-per-family always-on workflows, applying per-workflow conditions.
   * Following automation scope implies watch for the same chain (signatures must be observed).
   */
  function mergeAlwaysOnScopes(stored) {
    var out = emptyScopes();
    var members = collectLatestFamilyWorkflows(stored);
    var solBundle = stored[SOL_BUNDLE_KEY];
    var bscBundle = stored[BSC_BUNDLE_KEY];
    var hasIndexer = hasBscIndexerCredential(stored);

    for (var i = 0; i < members.length; i++) {
      var wf = members[i].wf;
      if (!workflowAlwaysOnEnabled(wf)) continue;
      var sc = scopesForWorkflow(wf);
      var c = conditionsForWorkflow(wf);

      var wantSol = !!(sc.followingSolanaWatch || sc.followingAutomationSolana);
      var wantBsc = !!(sc.followingBscWatch || sc.followingAutomationBsc);

      if (c.requireNonEmptyFollowingBundle === true) {
        if (wantSol && countBundleAddresses(solBundle) === 0) wantSol = false;
        if (wantBsc && countBundleAddresses(bscBundle) === 0) wantBsc = false;
      }
      if (c.requireBscScanKeyForBsc === true && wantBsc && !hasIndexer) {
        wantBsc = false;
      }

      if (wantSol) {
        if (sc.followingSolanaWatch) out.followingSolanaWatch = true;
        if (sc.followingAutomationSolana) {
          out.followingAutomationSolana = true;
          out.followingSolanaWatch = true;
        }
      }
      if (wantBsc) {
        if (sc.followingBscWatch) out.followingBscWatch = true;
        if (sc.followingAutomationBsc) {
          out.followingAutomationBsc = true;
          out.followingBscWatch = true;
        }
      }
      if (sc.fileWatch) out.fileWatch = true;
      if (sc.priceRangeWatch) out.priceRangeWatch = true;
      if (sc.custom) out.custom = true;
    }
    return out;
  }

  /**
   * @returns {{
   *   reason: string|null,
   *   legacy: boolean,
   *   allowSolanaWatch: boolean,
   *   allowBscWatch: boolean,
   *   allowFollowingAutomationSolana: boolean,
   *   allowFollowingAutomationBsc: boolean
   * }}
   */
  function evaluateFollowingAutomation(stored) {
    if (!hasAnyWorkflows(stored)) {
      return {
        reason: 'no_workflows',
        legacy: false,
        allowSolanaWatch: false,
        allowBscWatch: false,
        allowFollowingAutomationSolana: false,
        allowFollowingAutomationBsc: false,
        allowFileWatch: false,
        allowPriceRangeWatch: false,
        allowCustom: false,
      };
    }
    if (!anyWorkflowHasAlwaysOnEnabled(stored)) {
      var needCrypto =
        typeof global.__CFS_libraryNeedsCryptoOrPulseWatch === 'function'
          ? global.__CFS_libraryNeedsCryptoOrPulseWatch(stored)
          : true;
      return {
        reason: needCrypto ? null : 'no_crypto_workflow_steps',
        legacy: true,
        allowSolanaWatch: needCrypto,
        allowBscWatch: needCrypto,
        allowFollowingAutomationSolana: needCrypto,
        allowFollowingAutomationBsc: needCrypto,
        allowFileWatch: false,
        allowPriceRangeWatch: false,
        allowCustom: false,
      };
    }
    var merged = mergeAlwaysOnScopes(stored);
    var allowSol = !!(merged.followingSolanaWatch || merged.followingAutomationSolana);
    var allowBsc = !!(merged.followingBscWatch || merged.followingAutomationBsc);
    var allowFile = !!merged.fileWatch;
    var allowPrice = !!merged.priceRangeWatch;
    var allowCustom = !!merged.custom;
    if (!allowSol && !allowBsc && !allowFile && !allowPrice && !allowCustom) {
      return {
        reason: 'no_always_on_workflow',
        legacy: false,
        allowSolanaWatch: false,
        allowBscWatch: false,
        allowFollowingAutomationSolana: false,
        allowFollowingAutomationBsc: false,
        allowFileWatch: false,
        allowPriceRangeWatch: false,
        allowCustom: false,
      };
    }
    return {
      reason: null,
      legacy: false,
      allowSolanaWatch: allowSol,
      allowBscWatch: allowBsc,
      allowFollowingAutomationSolana: !!(allowSol && merged.followingAutomationSolana),
      allowFollowingAutomationBsc: !!(allowBsc && merged.followingAutomationBsc),
      allowFileWatch: allowFile,
      allowPriceRangeWatch: allowPrice,
      allowCustom: allowCustom,
    };
  }

  global.__CFS_evaluateFollowingAutomation = evaluateFollowingAutomation;
  global.__CFS_evaluateAlwaysOnAutomation = evaluateFollowingAutomation;
  global.__CFS_alwaysOnFromSteps = {
    CHECK_STEP_TYPE: CHECK_STEP,
    SCOPE_KEYS: SCOPE_KEYS,
    FOLLOWING_AUTOMATION_KEYS: FOLLOWING_AUTOMATION_KEYS,
    ALWAYS_ON_PRESERVE_KEYS: ALWAYS_ON_PRESERVE_KEYS,
    HIDE_E2E_KEY: HIDE_E2E_KEY,
    EVAL_EXTRA_STORAGE_KEYS: [HIDE_E2E_KEY],
    getWorkflowActions: getWorkflowActions,
    ensureWorkflowActions: ensureWorkflowActions,
    listCheckSteps: listCheckSteps,
    sourcesFromAction: sourcesFromAction,
    anySourceOn: anySourceOn,
    orScopesFromSteps: orScopesFromSteps,
    workflowAlwaysOnEnabled: workflowAlwaysOnEnabled,
    checkStepSwitchOn: checkStepSwitchOn,
    checkStepArmed: checkStepArmed,
    setCheckStepsAlwaysOnEnabled: setCheckStepsAlwaysOnEnabled,
    workflowHasRealtimeSources: workflowHasRealtimeSources,
    scopesForWorkflow: scopesForWorkflow,
    conditionsForWorkflow: conditionsForWorkflow,
    collectLatestFamilyWorkflows: collectLatestFamilyWorkflows,
    applyDerivedAlwaysOn: applyDerivedAlwaysOn,
    defaultCheckActionFromAlwaysOn: defaultCheckActionFromAlwaysOn,
    migrateLegacyAlwaysOnToStep: migrateLegacyAlwaysOnToStep,
    migrateWorkflowsAlwaysOnToSteps: migrateWorkflowsAlwaysOnToSteps,
    upsertCheckRealtimeSource: upsertCheckRealtimeSource,
    familyKey: familyKey,
  };
})(typeof self !== 'undefined' ? self : globalThis);
