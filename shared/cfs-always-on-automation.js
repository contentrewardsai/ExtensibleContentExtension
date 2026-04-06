/**
 * Following / Pulse: workflow gate + always-on (background) scopes.
 * Loaded in MV3 service worker via importScripts before solana-watch.js / bsc-watch.js.
 *
 * Exposes on globalThis:
 * - __CFS_evaluateFollowingAutomation(stored) → gate object for Solana/BSC watch and Following automation
 */
(function (global) {
  'use strict';

  var WORKFLOWS_KEY = 'workflows';
  var SOL_BUNDLE_KEY = 'cfsPulseSolanaWatchBundle';
  var BSC_BUNDLE_KEY = 'cfsPulseBscWatchBundle';
  var BSC_API_KEY = 'cfs_bscscan_api_key';

  function countBundleAddresses(bundle) {
    if (!bundle || !Array.isArray(bundle.entries)) return 0;
    var n = 0;
    for (var i = 0; i < bundle.entries.length; i++) {
      if ((bundle.entries[i].address || '').trim()) n++;
    }
    return n;
  }

  function hasAnyWorkflows(stored) {
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
    return Object.keys(w).length > 0;
  }

  function workflowAlwaysOnEnabled(wf) {
    return !!(wf && wf.alwaysOn && wf.alwaysOn.enabled === true);
  }

  function anyWorkflowHasAlwaysOnEnabled(stored) {
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
    var ids = Object.keys(w);
    for (var i = 0; i < ids.length; i++) {
      if (workflowAlwaysOnEnabled(w[ids[i]])) return true;
    }
    return false;
  }

  /**
   * Union scopes from all workflows with alwaysOn.enabled, applying per-workflow conditions.
   * Following automation scope implies watch for the same chain (signatures must be observed).
   */
  function mergeAlwaysOnScopes(stored) {
    var out = {
      followingSolanaWatch: false,
      followingBscWatch: false,
      followingAutomationSolana: false,
      followingAutomationBsc: false,
      fileWatch: false,
      priceRangeWatch: false,
      custom: false,
    };
    var w = stored[WORKFLOWS_KEY];
    if (!w || typeof w !== 'object' || Array.isArray(w)) return out;
    var ids = Object.keys(w);
    var solBundle = stored[SOL_BUNDLE_KEY];
    var bscBundle = stored[BSC_BUNDLE_KEY];
    var bscKey = String(stored[BSC_API_KEY] || '').trim();

    for (var i = 0; i < ids.length; i++) {
      var wf = w[ids[i]];
      if (!workflowAlwaysOnEnabled(wf)) continue;
      var ao = wf.alwaysOn;
      var sc = (ao && ao.scopes) || {};
      var c = (ao && ao.conditions) || {};

      var wantSol = !!(sc.followingSolanaWatch || sc.followingAutomationSolana);
      var wantBsc = !!(sc.followingBscWatch || sc.followingAutomationBsc);

      if (c.requireNonEmptyFollowingBundle === true) {
        if (wantSol && countBundleAddresses(solBundle) === 0) wantSol = false;
        if (wantBsc && countBundleAddresses(bscBundle) === 0) wantBsc = false;
      }
      if (c.requireBscScanKeyForBsc === true && wantBsc && !bscKey) {
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
      // New universal scopes (no conditions gating — purely opt-in)
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
  global.__CFS_evaluateAlwaysOnAutomation = evaluateFollowingAutomation; // unified alias
  global.__CFS_hasAnyWorkflowsForGate = hasAnyWorkflows;
})(typeof self !== 'undefined' ? self : globalThis);
